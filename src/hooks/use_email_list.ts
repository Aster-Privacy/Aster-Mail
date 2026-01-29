import type {
  InboxEmail,
  DecryptedEnvelope,
  EmailListState,
  MailItemMetadata,
} from "@/types/email";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import {
  MAIL_EVENTS,
  emit_mail_changed,
  emit_mail_item_updated,
  type MailItemUpdatedEventDetail,
} from "./mail_events";

import { strip_html_tags } from "@/lib/html_sanitizer";
import { is_astermail_sender, get_email_username } from "@/lib/utils";
import {
  list_mail_items,
  update_mail_item,
  update_mail_item_metadata,
  bulk_update_mail_items,
  type ListMailItemsParams,
  type MailItem,
} from "@/services/api/mail";
import {
  batch_archive as api_batch_archive,
  batch_unarchive as api_batch_unarchive,
} from "@/services/api/archive";
import { adjust_unread_count, adjust_inbox_count, adjust_trash_count, adjust_sent_count } from "@/hooks/use_mail_counts";
import { adjust_stats_inbox, adjust_stats_sent, adjust_stats_trash, adjust_stats_unread } from "@/hooks/use_mail_stats";
import { bulk_index_with_worker } from "@/services/crypto/search_worker_client";
import {
  get_passphrase_bytes,
  has_passphrase_in_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  decrypt_mail_metadata,
  encrypt_mail_metadata,
  extract_metadata_from_server,
  update_item_metadata,
} from "@/services/crypto/mail_metadata";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";
import { classify_email } from "@/services/classification/classifier";

const MIN_SKELETON_MS = 0;
const MAIL_FETCH_LIMIT = 50;
const CACHE_TTL_MS = 30_000;

const CATEGORY_STYLES = {
  placeholder:
    "bg-gray-100 text-gray-400 border border-gray-200 dark:bg-gray-800/30 dark:text-gray-500 dark:border-gray-600",
  default:
    "bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500",
} as const;

type MailView =
  | "inbox"
  | "sent"
  | "scheduled"
  | "starred"
  | "trash"
  | "archive"
  | "spam"
  | "snoozed"
  | "all";

type ViewParamValue = Partial<ListMailItemsParams> & {
  is_starred?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
};

const VIEW_PARAMS: Record<MailView, ViewParamValue> = {
  inbox: { item_type: "received" },
  sent: { item_type: "sent" },
  scheduled: { item_type: "scheduled" },
  starred: { is_starred: true },
  trash: { is_trashed: true },
  archive: { is_archived: true },
  spam: { is_spam: true },
  snoozed: { is_snoozed: true },
  all: {},
};

interface UseEmailListReturn {
  state: EmailListState;
  fetch_messages: () => Promise<void>;
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  remove_emails: (ids: string[]) => void;
  toggle_star: (id: string) => Promise<void>;
  toggle_pin: (id: string) => void;
  mark_read: (id: string) => Promise<void>;
  delete_email: (id: string) => Promise<void>;
  archive_email: (id: string) => Promise<void>;
  unarchive_email: (id: string) => Promise<void>;
  mark_spam: (id: string) => Promise<void>;
  set_category: (id: string, category: string, category_color: string) => void;
  bulk_delete: (ids: string[]) => Promise<void>;
  bulk_archive: (ids: string[]) => Promise<void>;
  bulk_unarchive: (ids: string[]) => Promise<void>;
  refresh: () => void;
}

interface CacheEntry {
  emails: InboxEmail[];
  total: number;
  timestamp: number;
}

class MailListCache {
  private cache: Map<string, CacheEntry> = new Map();
  private pending: Map<string, Promise<CacheEntry | null>> = new Map();

  get(view: string): CacheEntry | null {
    const entry = this.cache.get(view);

    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(view);

      return null;
    }

    return entry;
  }

  set(view: string, entry: CacheEntry): void {
    this.cache.set(view, entry);
  }

  invalidate(view?: string): void {
    if (view) {
      this.cache.delete(view);
      this.pending.delete(view);
    } else {
      this.cache.clear();
      this.pending.clear();
    }
  }

  get_pending(view: string): Promise<CacheEntry | null> | null {
    return this.pending.get(view) || null;
  }

  set_pending(view: string, request: Promise<CacheEntry | null> | null): void {
    if (request) {
      this.pending.set(view, request);
    } else {
      this.pending.delete(view);
    }
  }

  update_item(id: string, updates: Partial<InboxEmail>): void {
    this.cache.forEach((entry, view) => {
      const idx = entry.emails.findIndex((e) => e.id === id);

      if (idx !== -1) {
        entry.emails[idx] = { ...entry.emails[idx], ...updates };
        this.cache.set(view, entry);
      }
    });
  }

  remove_item(id: string): void {
    this.cache.forEach((entry, view) => {
      const filtered = entry.emails.filter((e) => e.id !== id);

      if (filtered.length !== entry.emails.length) {
        this.cache.set(view, {
          ...entry,
          emails: filtered,
          total: Math.max(0, entry.total - 1),
        });
      }
    });
  }
}

const mail_cache = new MailListCache();

function format_timestamp(date: Date, options: FormatOptions): string {
  return format_email_list_timestamp(date, options);
}

async function decrypt_envelope(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as DecryptedEnvelope;
    } catch {
      return null;
    }
  }

  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const key_hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(vault.identity_key + "astermail-envelope-v1"),
    );
    const crypto_key = await crypto.subtle.importKey(
      "raw",
      key_hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce_bytes },
      crypto_key,
      base64_to_array(encrypted),
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

function mail_to_email(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  format_options: FormatOptions,
): InboxEmail {
  const folders = item.labels?.map((label) => ({
    folder_token: label.token,
    name: label.name,
    color: label.color,
    icon: label.icon,
  }));

  const effective_metadata = extract_metadata_from_server(metadata, {
    scheduled_at: item.scheduled_at,
    send_status: item.send_status,
    snoozed_until: item.snoozed_until,
    message_ts: item.message_ts,
    item_type: item.item_type,
  });

  if (!envelope) {
    return {
      id: item.id,
      item_type: effective_metadata.item_type as MailItem["item_type"],
      sender_name: "•••••••",
      sender_email: "",
      subject: "••••••••••••••",
      preview: "•••••••••••••••••••••••••••",
      timestamp: format_timestamp(new Date(item.created_at), format_options),
      raw_timestamp: item.created_at,
      is_pinned: effective_metadata.is_pinned,
      is_starred: effective_metadata.is_starred,
      is_selected: false,
      is_read: effective_metadata.is_read,
      is_trashed: effective_metadata.is_trashed,
      is_archived: effective_metadata.is_archived,
      is_spam: effective_metadata.is_spam,
      has_attachment: effective_metadata.has_attachments,
      category: "",
      category_color: CATEGORY_STYLES.placeholder,
      avatar_url: "",
      is_encrypted: true,
      folders,
      snoozed_until: effective_metadata.snoozed_until,
      encrypted_metadata: item.encrypted_metadata,
      metadata_nonce: item.metadata_nonce,
      metadata_version: item.metadata_version,
    };
  }

  const is_aster_sender = is_astermail_sender(
    envelope.from.name,
    envelope.from.email,
  );

  const raw_ts = envelope.sent_at || item.created_at;

  const classification =
    item.item_type === "received"
      ? classify_email({ id: item.id, envelope })
      : null;

  return {
    id: item.id,
    item_type: effective_metadata.item_type as MailItem["item_type"],
    sender_name: envelope.from.name || get_email_username(envelope.from.email),
    sender_email: envelope.from.email,
    subject: envelope.subject || "(No subject)",
    preview: strip_html_tags(envelope.body_text).substring(0, 100),
    timestamp: format_timestamp(new Date(raw_ts), format_options),
    raw_timestamp: raw_ts,
    is_pinned: effective_metadata.is_pinned,
    is_starred: effective_metadata.is_starred,
    is_selected: false,
    is_read: effective_metadata.is_read,
    is_trashed: effective_metadata.is_trashed,
    is_archived: effective_metadata.is_archived,
    is_spam: effective_metadata.is_spam,
    has_attachment: effective_metadata.has_attachments,
    category: "",
    category_color: "",
    avatar_url: is_aster_sender ? "/mail_logo.png" : "",
    is_encrypted: false,
    folders,
    snoozed_until: effective_metadata.snoozed_until,
    thread_token: item.thread_token,
    thread_message_count: item.thread_message_count,
    encrypted_metadata: item.encrypted_metadata,
    metadata_nonce: item.metadata_nonce,
    metadata_version: item.metadata_version,
    email_category: classification?.category,
    category_confidence: classification?.confidence,
  };
}

function group_emails_by_thread(emails: InboxEmail[]): InboxEmail[] {
  const thread_groups = new Map<string, InboxEmail[]>();
  const standalone_emails: InboxEmail[] = [];

  for (const email of emails) {
    if (email.thread_token) {
      const existing = thread_groups.get(email.thread_token);

      if (existing) {
        existing.push(email);
      } else {
        thread_groups.set(email.thread_token, [email]);
      }
    } else {
      standalone_emails.push(email);
    }
  }

  const grouped_emails: InboxEmail[] = [];

  for (const [, thread_emails] of thread_groups) {
    thread_emails.sort((a, b) => {
      const ts_a = a.raw_timestamp || a.timestamp;
      const ts_b = b.raw_timestamp || b.timestamp;

      return new Date(ts_b).getTime() - new Date(ts_a).getTime();
    });

    const representative = { ...thread_emails[0] };

    representative.thread_message_count = thread_emails.length;

    const has_unread = thread_emails.some((e) => !e.is_read);
    const has_starred = thread_emails.some((e) => e.is_starred);

    representative.is_read = !has_unread;
    representative.is_starred = has_starred;

    grouped_emails.push(representative);
  }

  return [...grouped_emails, ...standalone_emails].sort((a, b) => {
    const ts_a = a.raw_timestamp || a.timestamp;
    const ts_b = b.raw_timestamp || b.timestamp;

    return new Date(ts_b).getTime() - new Date(ts_a).getTime();
  });
}

async function fetch_mail_from_api(
  view: string,
  signal: AbortSignal,
  format_options: FormatOptions,
): Promise<{ emails: InboxEmail[]; total: number; expired: boolean } | null> {
  const params: ListMailItemsParams = {
    limit: MAIL_FETCH_LIMIT,
    ...VIEW_PARAMS[view as MailView],
  };

  if (view.startsWith("folder-")) {
    const folder_token = view.replace("folder-", "");

    params.label_token = folder_token;
  } else if (!VIEW_PARAMS[view as MailView]) {
    params.item_type = "received";
  }

  const response = await list_mail_items(params);

  if (signal.aborted || !response.data) return null;

  const { items, total } = response.data;

  const results = await Promise.allSettled(
    items.map(async (item) => {
      if (signal.aborted) throw new Error("aborted");

      const [envelope, metadata] = await Promise.all([
        decrypt_envelope(item.encrypted_envelope, item.envelope_nonce),
        item.encrypted_metadata && item.metadata_nonce
          ? decrypt_mail_metadata(
              item.encrypted_metadata,
              item.metadata_nonce,
              item.metadata_version,
            )
          : Promise.resolve(null),
      ]);

      return { item, envelope, metadata };
    }),
  );

  if (signal.aborted) return null;

  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );

  if (rejected.length > 0 && process.env.NODE_ENV === "development") {
    console.warn(
      `[use_email_list] ${rejected.length} email(s) failed to decrypt:`,
      rejected.map((r) => r.reason),
    );
  }

  const successful = results
    .filter(
      (
        r,
      ): r is PromiseFulfilledResult<{
        item: MailItem;
        envelope: DecryptedEnvelope | null;
        metadata: MailItemMetadata | null;
      }> => r.status === "fulfilled",
    )
    .map((r) => r.value);

  const emails = successful.map(({ item, envelope, metadata }) =>
    mail_to_email(item, envelope, metadata, format_options),
  );

  const decrypted = emails.filter((e) => !e.is_encrypted);

  if (decrypted.length > 0) {
    bulk_index_with_worker(
      decrypted.map((e) => ({
        id: e.id,
        fields: {
          subject: e.subject,
          body: e.preview,
          sender_email: e.sender_email,
          sender_name: e.sender_name,
        },
      })),
    ).catch(() => void 0);
  }

  const expired = decrypted.length === 0 && items.length > 0;

  const skip_grouping = view === "starred";
  const final_emails = skip_grouping
    ? emails.sort((a, b) => {
        const ts_a = a.raw_timestamp || a.timestamp;
        const ts_b = b.raw_timestamp || b.timestamp;

        return new Date(ts_b).getTime() - new Date(ts_a).getTime();
      })
    : group_emails_by_thread(emails);

  return { emails: final_emails, total, expired };
}

export function use_email_list(current_view: string): UseEmailListReturn {
  const {
    has_keys,
    is_loading: auth_loading,
    is_authenticated,
    user,
  } = use_auth();
  const { preferences } = use_preferences();
  const [state, set_state] = useState<EmailListState>({
    emails: [],
    is_loading: true,
    total_messages: 0,
  });
  const abort_ref = useRef<AbortController | null>(null);
  const mounted_ref = useRef(true);
  const prev_auth_ref = useRef<{
    has_keys: boolean;
    is_authenticated: boolean;
  } | null>(null);
  const prev_view_ref = useRef<string | null>(null);
  const prev_user_id_ref = useRef<string | null>(null);
  const passphrase_check_ref = useRef<NodeJS.Timeout | null>(null);
  const fetch_messages_ref = useRef<(() => Promise<void>) | null>(null);

  const is_mail_view = useMemo(() => current_view !== "drafts", [current_view]);

  const format_options: FormatOptions = useMemo(
    () => ({
      date_format: preferences.date_format as FormatOptions["date_format"],
      time_format: preferences.time_format,
    }),
    [preferences.date_format, preferences.time_format],
  );

  const fetch_messages = useCallback(async (): Promise<void> => {
    if (!is_mail_view) return;

    if (!has_passphrase_in_memory()) {
      set_state((prev) => ({ ...prev, is_loading: false }));

      return;
    }

    const pending = mail_cache.get_pending(current_view);

    if (pending) {
      const result = await pending;

      if (!mounted_ref.current) return;
      if (result) {
        set_state({
          emails: result.emails.map((e) => ({ ...e, is_selected: false })),
          is_loading: false,
          total_messages: result.total,
        });

        return;
      }
    }

    abort_ref.current?.abort();
    abort_ref.current = new AbortController();
    const { signal } = abort_ref.current;
    const start = Date.now();

    set_state((prev) => ({ ...prev, is_loading: true }));

    const fetch_promise = (async (): Promise<CacheEntry | null> => {
      try {
        const result = await fetch_mail_from_api(
          current_view,
          signal,
          format_options,
        );

        if (signal.aborted) return null;

        const elapsed = Date.now() - start;

        if (elapsed < MIN_SKELETON_MS) {
          await new Promise((r) => setTimeout(r, MIN_SKELETON_MS - elapsed));
        }

        if (signal.aborted) return null;

        if (!result) return null;

        if (result.expired) {
          return null;
        }

        const cache_entry: CacheEntry = {
          emails: result.emails,
          total: result.total,
          timestamp: Date.now(),
        };

        mail_cache.set(current_view, cache_entry);

        return cache_entry;
      } catch {
        return null;
      } finally {
        mail_cache.set_pending(current_view, null);
      }
    })();

    mail_cache.set_pending(current_view, fetch_promise);

    const result = await fetch_promise;

    if (!mounted_ref.current || signal.aborted) return;

    if (result) {
      set_state({
        emails: result.emails,
        is_loading: false,
        total_messages: result.total,
      });
    } else {
      set_state((prev) => ({ ...prev, is_loading: false }));
    }
  }, [current_view, is_mail_view, format_options]);

  fetch_messages_ref.current = fetch_messages;

  const refresh = useCallback(() => {
    mail_cache.invalidate(current_view);
    fetch_messages_ref.current?.();
  }, [current_view]);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  useEffect(() => {
    if (auth_loading || !is_mail_view) return;

    const prev_auth = prev_auth_ref.current;
    const prev_view = prev_view_ref.current;
    const prev_user_id = prev_user_id_ref.current;
    const current_user_id = user?.id || null;

    const auth_changed =
      prev_auth !== null &&
      (prev_auth.has_keys !== has_keys ||
        prev_auth.is_authenticated !== is_authenticated);
    const view_changed = prev_view !== null && prev_view !== current_view;
    const user_changed =
      prev_user_id !== null && prev_user_id !== current_user_id;

    prev_auth_ref.current = { has_keys, is_authenticated };
    prev_view_ref.current = current_view;
    prev_user_id_ref.current = current_user_id;

    abort_ref.current?.abort();

    if (auth_changed || user_changed) {
      mail_cache.invalidate();
      set_state({ emails: [], is_loading: true, total_messages: 0 });
    } else if (view_changed) {
      mail_cache.invalidate(current_view);
    }

    if (has_keys && has_passphrase_in_memory()) {
      set_state((prev) => ({ ...prev, is_loading: true }));
      fetch_messages_ref.current?.();
    } else if (has_keys && !has_passphrase_in_memory()) {
      set_state((prev) => ({ ...prev, is_loading: true }));
    } else if (is_authenticated && !has_keys) {
      set_state((prev) => ({ ...prev, is_loading: true }));
    } else {
      set_state({ emails: [], is_loading: false, total_messages: 0 });
    }

    return () => abort_ref.current?.abort();
  }, [
    auth_loading,
    has_keys,
    is_authenticated,
    current_view,
    is_mail_view,
    user?.id,
  ]);

  useEffect(() => {
    if (auth_loading || !is_mail_view || !has_keys) return;
    if (has_passphrase_in_memory()) return;

    if (passphrase_check_ref.current) {
      clearInterval(passphrase_check_ref.current);
    }

    set_state((prev) => ({ ...prev, is_loading: true }));
    let attempts = 0;
    const max_attempts = 20;

    passphrase_check_ref.current = setInterval(() => {
      attempts++;

      if (has_passphrase_in_memory()) {
        if (passphrase_check_ref.current) {
          clearInterval(passphrase_check_ref.current);
          passphrase_check_ref.current = null;
        }
        fetch_messages_ref.current?.();
      } else if (attempts >= max_attempts) {
        if (passphrase_check_ref.current) {
          clearInterval(passphrase_check_ref.current);
          passphrase_check_ref.current = null;
        }
        set_state((prev) => ({ ...prev, is_loading: false }));
      }
    }, 100);

    return () => {
      if (passphrase_check_ref.current) {
        clearInterval(passphrase_check_ref.current);
        passphrase_check_ref.current = null;
      }
    };
  }, [auth_loading, has_keys, is_mail_view]);

  useEffect(() => {
    if (!is_mail_view) return;

    let debounce_timer: ReturnType<typeof setTimeout> | null = null;

    const handler = () => {
      if (has_keys && has_passphrase_in_memory()) {
        if (debounce_timer) {
          clearTimeout(debounce_timer);
        }
        debounce_timer = setTimeout(() => {
          mail_cache.invalidate();
          fetch_messages_ref.current?.();
        }, 150);
      }
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handler);
    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, handler);

    return () => {
      if (debounce_timer) {
        clearTimeout(debounce_timer);
      }
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handler);
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, handler);
    };
  }, [has_keys, is_mail_view]);

  useEffect(() => {
    const handle_item_update = (event: Event) => {
      const detail = (event as CustomEvent<MailItemUpdatedEventDetail>).detail;

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.map((e) =>
          e.id === detail.id ? { ...e, ...detail } : e,
        ),
      }));
      mail_cache.update_item(detail.id, detail);
    };

    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, handle_item_update);

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEM_UPDATED,
        handle_item_update,
      );
    };
  }, []);

  const update_email = useCallback(
    (id: string, updates: Partial<InboxEmail>): void => {
      set_state((prev) => ({
        ...prev,
        emails: prev.emails.map((e) =>
          e.id === id ? { ...e, ...updates } : e,
        ),
      }));
      mail_cache.update_item(id, updates);
    },
    [],
  );

  const remove_email = useCallback((id: string): void => {
    set_state((prev) => ({
      ...prev,
      emails: prev.emails.filter((e) => e.id !== id),
      total_messages: Math.max(0, prev.total_messages - 1),
    }));
    mail_cache.remove_item(id);
  }, []);

  const remove_emails = useCallback((ids: string[]): void => {
    const id_set = new Set(ids);

    set_state((prev) => ({
      ...prev,
      emails: prev.emails.filter((e) => !id_set.has(e.id)),
      total_messages: Math.max(0, prev.total_messages - ids.length),
    }));
    ids.forEach((id) => mail_cache.remove_item(id));
  }, []);

  const api_update = useCallback(
    async (
      id: string,
      updates: Partial<{
        is_read: boolean;
        is_starred: boolean;
        is_pinned: boolean;
        is_trashed: boolean;
        is_archived: boolean;
        is_spam: boolean;
      }>,
      emit_full_refresh = false,
    ) => {
      const email = state.emails.find((e) => e.id === id);
      let current_metadata: MailItemMetadata | null = null;

      if (email?.encrypted_metadata && email?.metadata_nonce) {
        current_metadata = await decrypt_mail_metadata(
          email.encrypted_metadata,
          email.metadata_nonce,
          email.metadata_version,
        );
      }

      if (!current_metadata) {
        current_metadata = {
          is_read: email?.is_read ?? false,
          is_starred: email?.is_starred ?? false,
          is_pinned: email?.is_pinned ?? false,
          is_trashed: email?.is_trashed ?? false,
          is_archived: email?.is_archived ?? false,
          is_spam: email?.is_spam ?? false,
          size_bytes: 0,
          has_attachments: email?.has_attachment ?? false,
          attachment_count: 0,
          message_ts: new Date().toISOString(),
          item_type: email?.item_type ?? "received",
        };
      }

      const updated_metadata: MailItemMetadata = {
        ...current_metadata,
        is_read: updates.is_read ?? current_metadata.is_read,
        is_starred: updates.is_starred ?? current_metadata.is_starred,
        is_pinned: updates.is_pinned ?? current_metadata.is_pinned,
        is_trashed: updates.is_trashed ?? current_metadata.is_trashed,
        is_archived: updates.is_archived ?? current_metadata.is_archived,
        is_spam: updates.is_spam ?? current_metadata.is_spam,
      };

      const encrypted = await encrypt_mail_metadata(updated_metadata);

      if (encrypted) {
        const result = await update_mail_item_metadata(id, {
          encrypted_metadata: encrypted.encrypted_metadata,
          metadata_nonce: encrypted.metadata_nonce,
        });

        if (result.data) {
          update_email(id, {
            ...updates,
            encrypted_metadata: encrypted.encrypted_metadata,
            metadata_nonce: encrypted.metadata_nonce,
          } as Partial<InboxEmail>);
          if (emit_full_refresh) {
            emit_mail_changed();
          } else {
            emit_mail_item_updated({
              id,
              ...updates,
            } as MailItemUpdatedEventDetail);
          }
        }
      } else {
        const result = await update_mail_item(id, {});

        if (result.data) {
          update_email(id, updates as Partial<InboxEmail>);
          if (emit_full_refresh) {
            emit_mail_changed();
          } else {
            emit_mail_item_updated({
              id,
              ...updates,
            } as MailItemUpdatedEventDetail);
          }
        }
      }
    },
    [update_email, state.emails],
  );

  const toggle_star = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);

      if (email) await api_update(id, { is_starred: !email.is_starred });
    },
    [state.emails, api_update],
  );

  const toggle_pin = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);

      if (email) await api_update(id, { is_pinned: !email.is_pinned });
    },
    [state.emails, api_update],
  );

  const mark_read = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);

      if (email) {
        const new_read_state = !email.is_read;

        if (email.item_type === "received") {
          adjust_unread_count(new_read_state ? -1 : 1);
        }
        await api_update(id, { is_read: new_read_state });
      }
    },
    [state.emails, api_update],
  );

  const delete_email = useCallback(
    async (id: string) => {
      const email_to_restore = state.emails.find((e) => e.id === id);
      const is_received = email_to_restore?.item_type === "received";
      const is_sent = email_to_restore?.item_type === "sent";
      const should_adjust_unread = is_received && !email_to_restore?.is_read;

      remove_email(id);
      if (should_adjust_unread) {
        adjust_unread_count(-1);
        adjust_stats_unread(-1);
      }
      if (is_received) {
        adjust_inbox_count(-1);
        adjust_stats_inbox(-1);
      } else if (is_sent) {
        adjust_sent_count(-1);
        adjust_stats_sent(-1);
      }
      adjust_trash_count(1);
      adjust_stats_trash(1);

      const result = await update_item_metadata(
        id,
        {
          encrypted_metadata: email_to_restore?.encrypted_metadata,
          metadata_nonce: email_to_restore?.metadata_nonce,
          metadata_version: email_to_restore?.metadata_version,
        },
        { is_trashed: true },
      );

      if (result.success) {
        emit_mail_changed();
      } else {
        if (should_adjust_unread) {
          adjust_unread_count(1);
          adjust_stats_unread(1);
        }
        if (is_received) {
          adjust_inbox_count(1);
          adjust_stats_inbox(1);
        } else if (is_sent) {
          adjust_sent_count(1);
          adjust_stats_sent(1);
        }
        adjust_trash_count(-1);
        adjust_stats_trash(-1);
        if (email_to_restore) {
          set_state((prev) => ({
            ...prev,
            emails: [...prev.emails, email_to_restore].sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            ),
            total_messages: prev.total_messages + 1,
          }));
        }
      }
    },
    [state.emails, remove_email],
  );

  const archive_email = useCallback(
    async (id: string) => {
      const email_to_restore = state.emails.find((e) => e.id === id);
      const should_adjust_unread =
        email_to_restore?.item_type === "received" &&
        !email_to_restore?.is_read;

      remove_email(id);
      if (should_adjust_unread) {
        adjust_unread_count(-1);
      }
      const result = await api_batch_archive({ ids: [id], tier: "hot" });

      if (result.data?.success) {
        emit_mail_changed();
      } else {
        if (should_adjust_unread) {
          adjust_unread_count(1);
        }
        if (email_to_restore) {
          set_state((prev) => ({
            ...prev,
            emails: [...prev.emails, email_to_restore].sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            ),
            total_messages: prev.total_messages + 1,
          }));
        }
      }
    },
    [state.emails, remove_email],
  );

  const unarchive_email = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);
      const should_adjust_unread =
        email?.item_type === "received" && !email?.is_read;

      remove_email(id);
      if (should_adjust_unread) {
        adjust_unread_count(1);
      }
      const result = await api_batch_unarchive({ ids: [id] });

      if (result.data?.success) {
        emit_mail_changed();
      } else {
        if (should_adjust_unread) {
          adjust_unread_count(-1);
        }
        refresh();
      }
    },
    [state.emails, remove_email, refresh],
  );

  const mark_spam = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);
      const should_adjust_unread =
        email?.item_type === "received" && !email?.is_read;

      remove_email(id);
      if (should_adjust_unread) {
        adjust_unread_count(-1);
      }

      const result = await update_item_metadata(
        id,
        {
          encrypted_metadata: email?.encrypted_metadata,
          metadata_nonce: email?.metadata_nonce,
          metadata_version: email?.metadata_version,
        },
        { is_spam: true },
      );

      if (result.success) {
        emit_mail_changed();
      } else {
        if (should_adjust_unread) {
          adjust_unread_count(1);
        }
        refresh();
      }
    },
    [state.emails, remove_email, refresh],
  );

  const set_category = useCallback(
    (id: string, category: string, category_color: string) => {
      update_email(id, { category, category_color });
    },
    [update_email],
  );

  const bulk_update = useCallback(
    async (
      ids: string[],
      updates: { is_trashed?: boolean; is_archived?: boolean },
    ) => {
      if (ids.length === 0) return;

      const id_set = new Set(ids);
      const emails_to_restore = state.emails.filter((e) => id_set.has(e.id));

      const unread_received_count = emails_to_restore.filter(
        (e) => e.item_type === "received" && !e.is_read,
      ).length;
      const received_count = emails_to_restore.filter(
        (e) => e.item_type === "received",
      ).length;
      const sent_count = emails_to_restore.filter(
        (e) => e.item_type === "sent",
      ).length;

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));
      ids.forEach((id) => mail_cache.remove_item(id));

      if (unread_received_count > 0) {
        adjust_unread_count(-unread_received_count);
        adjust_stats_unread(-unread_received_count);
      }
      if (updates.is_trashed) {
        if (received_count > 0) {
          adjust_inbox_count(-received_count);
          adjust_stats_inbox(-received_count);
        }
        if (sent_count > 0) {
          adjust_sent_count(-sent_count);
          adjust_stats_sent(-sent_count);
        }
        adjust_trash_count(ids.length);
        adjust_stats_trash(ids.length);
      }

      try {
        await bulk_update_mail_items({ ids, ...updates });
        emit_mail_changed();
      } catch {
        if (unread_received_count > 0) {
          adjust_unread_count(unread_received_count);
          adjust_stats_unread(unread_received_count);
        }
        if (updates.is_trashed) {
          if (received_count > 0) {
            adjust_inbox_count(received_count);
            adjust_stats_inbox(received_count);
          }
          if (sent_count > 0) {
            adjust_sent_count(sent_count);
            adjust_stats_sent(sent_count);
          }
          adjust_trash_count(-ids.length);
          adjust_stats_trash(-ids.length);
        }
        set_state((prev) => ({
          ...prev,
          emails: [...prev.emails, ...emails_to_restore].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
          total_messages: prev.total_messages + emails_to_restore.length,
        }));
      }
    },
    [state.emails],
  );

  const bulk_delete = useCallback(
    (ids: string[]) => bulk_update(ids, { is_trashed: true }),
    [bulk_update],
  );

  const bulk_archive = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;

      const id_set = new Set(ids);
      const emails_to_restore = state.emails.filter((e) => id_set.has(e.id));

      const unread_received_count = emails_to_restore.filter(
        (e) => e.item_type === "received" && !e.is_read,
      ).length;

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));
      ids.forEach((id) => mail_cache.remove_item(id));

      if (unread_received_count > 0) {
        adjust_unread_count(-unread_received_count);
      }

      try {
        await api_batch_archive({ ids, tier: "hot" });
        emit_mail_changed();
      } catch {
        if (unread_received_count > 0) {
          adjust_unread_count(unread_received_count);
        }
        set_state((prev) => ({
          ...prev,
          emails: [...prev.emails, ...emails_to_restore].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
          total_messages: prev.total_messages + emails_to_restore.length,
        }));
      }
    },
    [state.emails],
  );

  const bulk_unarchive = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;

      const id_set = new Set(ids);
      const emails_to_restore = state.emails.filter((e) => id_set.has(e.id));

      const unread_received_count = emails_to_restore.filter(
        (e) => e.item_type === "received" && !e.is_read,
      ).length;

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        total_messages: Math.max(0, prev.total_messages - ids.length),
      }));
      ids.forEach((id) => mail_cache.remove_item(id));

      if (unread_received_count > 0) {
        adjust_unread_count(unread_received_count);
      }

      try {
        await api_batch_unarchive({ ids });
        emit_mail_changed();
      } catch {
        if (unread_received_count > 0) {
          adjust_unread_count(-unread_received_count);
        }
        set_state((prev) => ({
          ...prev,
          emails: [...prev.emails, ...emails_to_restore].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
          total_messages: prev.total_messages + emails_to_restore.length,
        }));
      }
    },
    [state.emails],
  );

  return {
    state,
    fetch_messages,
    update_email,
    remove_email,
    remove_emails,
    toggle_star,
    toggle_pin,
    mark_read,
    delete_email,
    archive_email,
    unarchive_email,
    mark_spam,
    set_category,
    bulk_delete,
    bulk_archive,
    bulk_unarchive,
    refresh,
  };
}

export function invalidate_mail_cache(view?: string): void {
  mail_cache.invalidate(view);
}
