//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type {
  InboxEmail,
  DecryptedEnvelope,
  MailItemMetadata,
} from "@/types/email";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
  is_ratchet_envelope,
} from "@/utils/email_crypto";
import { build_body_preview } from "@/utils/preview_text";
import {
  classify,
  is_locked_to_primary,
} from "@/services/mail_categorizer";
import { get_email_username } from "@/lib/utils";
import { resolve_forwarding_display } from "@/utils/forwarding_alias";
import { extract_reply_to } from "@/utils/reply_to";
import {
  list_mail_items,
  type ListMailItemsParams,
  type MailItem,
} from "@/services/api/mail";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
  wait_for_keys_ready,
} from "@/services/crypto/memory_key_store";
import { decrypt_message_with_any_key } from "@/services/crypto/key_manager";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
  normalize_envelope_from,
  normalize_envelope_recipients,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  decrypt_mail_metadata,
  extract_metadata_from_server,
} from "@/services/crypto/mail_metadata";
import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";
import { decrypt_body_text_with_bundle } from "@/utils/email_crypto";
import { is_reaction_payload_body } from "@/lib/reaction_payload";
import { get_alias_hash_by_address } from "@/hooks/use_sidebar_aliases";
import {
  resolve_sender_profiles,
  get_cached_profile,
} from "@/services/api/sender_profiles";

const HASH_ALG = ["SHA", "256"].join("-");

export const DEFAULT_PAGE_SIZE = 50;

export const UNKNOWN_TOTAL = -1;

const MAX_PAGE_TOP_UP_ROUNDS = 3;

export type MailView =
  | "inbox"
  | "sent"
  | "scheduled"
  | "starred"
  | "trash"
  | "archive"
  | "spam"
  | "snoozed"
  | "all";

export const VIEW_PARAMS: Record<MailView, Partial<ListMailItemsParams>> = {
  inbox: {
    item_type: "received",
    is_trashed: false,
    is_spam: false,
    is_archived: false,
  },
  sent: { item_type: "sent", is_trashed: false, is_spam: false },
  scheduled: { item_type: "scheduled", is_trashed: false, is_spam: false },
  starred: { is_starred: true, is_trashed: false, is_spam: false },
  trash: { is_trashed: true },
  archive: { is_archived: true, is_trashed: false, is_spam: false },
  spam: { is_spam: true },
  snoozed: { is_snoozed: true, is_trashed: false, is_spam: false },
  all: { item_type: "all", include_spam: false, include_trash: false },
};

const VIEWS_EXCLUDING_TRASHED_SPAM = new Set<string>([
  "inbox",
  "sent",
  "scheduled",
  "starred",
  "archive",
  "snoozed",
  "all",
]);

function should_exclude_trashed_spam(view: string): boolean {
  return (
    VIEWS_EXCLUDING_TRASHED_SPAM.has(view) ||
    view.startsWith("folder-") ||
    view.startsWith("tag-") ||
    view.startsWith("alias-")
  );
}

const OUTGOING_VIEWS = new Set<string>(["sent", "drafts", "scheduled"]);

export function is_outgoing_view(current_view: string | undefined): boolean {
  return current_view != null && OUTGOING_VIEWS.has(current_view);
}

export function outgoing_recipient_names(
  current_view: string | undefined,
  recipient_names: string[] | undefined,
): string[] | null {
  return is_outgoing_view(current_view) &&
    recipient_names &&
    recipient_names.length > 0
    ? recipient_names
    : null;
}

export function outgoing_profile_email(
  current_view: string | undefined,
  recipient_addresses: string[] | undefined,
  sender_email: string,
): string {
  const first_recipient = recipient_addresses?.[0];

  return is_outgoing_view(current_view) && first_recipient
    ? first_recipient
    : sender_email;
}

export function resolve_list_display_name(params: {
  outgoing_names: string[] | null;
  thread_participant_names: string[] | undefined;
  fallback_name: string;
  to_prefix: string;
}): string {
  if (params.outgoing_names) {
    return `${params.to_prefix}: ${params.outgoing_names.join(", ")}`;
  }

  if (
    params.thread_participant_names &&
    params.thread_participant_names.length > 0
  ) {
    return params.thread_participant_names.join(", ");
  }

  return params.fallback_name;
}

export function is_snoozed_in_future(
  snoozed_until: string | null | undefined,
): boolean {
  if (!snoozed_until) return false;

  const wake_ms = new Date(snoozed_until).getTime();

  return Number.isFinite(wake_ms) && wake_ms > Date.now();
}

export function should_keep_email_in_view(
  flags: {
    is_trashed?: boolean;
    is_spam?: boolean;
    is_archived?: boolean;
    item_type?: string;
    snoozed_until?: string | null;
  },
  view: string,
): boolean {
  if (
    (view === "inbox" || view === "") &&
    flags.item_type !== undefined &&
    flags.item_type !== "received"
  ) {
    return false;
  }

  if (
    (view === "inbox" || view === "") &&
    is_snoozed_in_future(flags.snoozed_until)
  ) {
    return false;
  }

  if (!should_exclude_trashed_spam(view)) return true;

  if (flags.is_trashed || flags.is_spam) return false;

  const is_folder_like_view =
    view.startsWith("folder-") ||
    view.startsWith("tag-") ||
    view.startsWith("alias-");

  if (
    !(
      view === "archive" ||
      view === "all" ||
      is_folder_like_view ||
      !flags.is_archived
    )
  ) {
    return false;
  }

  return true;
}

function format_timestamp(date: Date, options: FormatOptions): string {
  return format_email_list_timestamp(date, options);
}

const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];

async function try_decrypt_with_identity_key(
  encrypted: string,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<DecryptedEnvelope | null> {
  const encrypted_bytes = base64_to_array(encrypted);

  for (const version of ENVELOPE_KEY_VERSIONS) {
    try {
      const key_hash = await crypto.subtle.digest(
        HASH_ALG,
        new TextEncoder().encode(identity_key + version),
      );
      const crypto_key = await crypto.subtle.importKey(
        "raw",
        key_hash,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const decrypted = await decrypt_aes_gcm_with_fallback(
        crypto_key,
        encrypted_bytes,
        nonce_bytes,
      );

      const parsed = JSON.parse(new TextDecoder().decode(decrypted));
      const from = normalize_envelope_from(parsed.from);

      if (from) parsed.from = from;

      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

export async function decrypt_envelope(
  encrypted: string,
  nonce: string,
  mail_item_id?: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return JSON.parse(text) as DecryptedEnvelope;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const decrypted = await decrypt_message_with_any_key(
          text,
          [vault.identity_key, ...(vault.previous_keys ?? [])],
          pass,
        );

        return JSON.parse(decrypted) as DecryptedEnvelope;
      }

      return null;
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

    const first_byte = base64_to_array(encrypted)[0];
    if (
      nonce_bytes.length === 12 &&
      (first_byte === 2 || first_byte === 3 || first_byte === 4)
    ) {
      const { decrypt_mail_envelope } = await import(
        "@/components/email/shared/decrypt_envelope"
      );
      const ecies_result = await decrypt_mail_envelope<DecryptedEnvelope>(
        encrypted,
        nonce,
        mail_item_id,
      );
      if (ecies_result) return ecies_result;
    }

    let vault = get_vault_from_memory();

    if (!vault?.identity_key) {
      await wait_for_keys_ready();
      vault = get_vault_from_memory();
    }

    if (!vault?.identity_key) return null;

    const result = await try_decrypt_with_identity_key(
      encrypted,
      nonce_bytes,
      vault.identity_key,
    );

    if (result) return result;

    if (vault.previous_keys && vault.previous_keys.length > 0) {
      for (const prev_key of vault.previous_keys) {
        const prev_result = await try_decrypt_with_identity_key(
          encrypted,
          nonce_bytes,
          prev_key,
        );

        if (prev_result) return prev_result;
      }
    }

    return null;
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

export function mail_to_email(
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

  const tags = item.tag_tokens?.map((token) => ({
    id: token,
    name: "",
    color: undefined as string | undefined,
    icon: undefined as string | undefined,
  }));

  const effective_metadata = extract_metadata_from_server(metadata, {
    scheduled_at: item.scheduled_at,
    send_status: item.send_status,
    snoozed_until: item.snoozed_until,
    message_ts: item.message_ts,
    item_type: item.item_type,
    is_read: item.is_read,
    is_starred: item.is_starred,
    is_pinned: item.is_pinned,
    is_trashed: item.is_trashed,
    is_archived: item.is_archived,
    is_spam: item.is_spam,
    has_attachments: item.has_attachments,
    attachment_count: item.attachment_count,
    size_bytes: item.size_bytes,
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
      category_color: "",
      avatar_url: "",
      is_encrypted: true,
      is_external: item.is_external,
      folders,
      tags,
      snoozed_until: effective_metadata.snoozed_until,
      routing_token: item.routing_token,
      encrypted_metadata: item.encrypted_metadata,
      metadata_nonce: item.metadata_nonce,
      metadata_version: item.metadata_version,
      expires_at: item.expires_at,
      expiry_type: item.expiry_type,
      send_status: effective_metadata.send_status,
      send_error: item.send_error,
      size_bytes:
        effective_metadata.size_bytes ||
        Math.ceil((item.encrypted_envelope?.length || 0) * 0.75),
    };
  }

  const to_recipients = envelope.to
    ? normalize_envelope_recipients(envelope.to)
    : undefined;
  const recipient_addresses = to_recipients
    ?.map((r) => r.email)
    .filter(Boolean);
  const recipient_names = to_recipients
    ?.map((r) => r.name || get_email_username(r.email))
    .filter(Boolean);

  const resolved_text = envelope.body_text ?? envelope.text_body ?? "";
  const raw_html = envelope.body_html ?? envelope.html_body ?? "";
  const resolved_html = is_ratchet_envelope(raw_html) ? "" : raw_html;
  const is_undecryptable_body =
    resolved_text === RATCHET_UNDECRYPTABLE_SENTINEL ||
    resolved_html === RATCHET_UNDECRYPTABLE_SENTINEL ||
    resolved_text === PGP_UNDECRYPTABLE_SENTINEL ||
    resolved_html === PGP_UNDECRYPTABLE_SENTINEL ||
    is_ratchet_envelope(resolved_text) ||
    (!resolved_text && is_ratchet_envelope(raw_html));
  const preview_text = is_undecryptable_body
    ? RATCHET_UNDECRYPTABLE_SENTINEL
    : build_body_preview(resolved_text, resolved_html);
  const raw_ts =
    envelope.sent_at ||
    (envelope as unknown as Record<string, string>).date ||
    item.created_at;

  const from_email = envelope.from?.email || "";
  const from_name = envelope.from?.name || "";
  const sender_profile = get_cached_profile(from_email);
  const forwarding = resolve_forwarding_display(
    envelope.from,
    envelope.raw_headers,
  );

  return {
    id: item.id,
    item_type: effective_metadata.item_type as MailItem["item_type"],
    sender_name: from_name || get_email_username(from_email),
    sender_email: from_email,
    ...(forwarding ?? {}),
    subject: envelope.subject || "",
    preview: preview_text,
    body_html: is_undecryptable_body ? RATCHET_UNDECRYPTABLE_SENTINEL : "",
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
    mail_category: classify(envelope, metadata, {
      rule_category: item.rule_category,
    }),
    avatar_url: sender_profile?.profile_picture || "",
    is_encrypted: false,
    is_external: item.is_external,
    folders,
    tags,
    snoozed_until: effective_metadata.snoozed_until,
    thread_token: item.thread_token,
    routing_token: item.routing_token,
    thread_message_count: item.thread_message_count,
    encrypted_metadata: item.encrypted_metadata,
    metadata_nonce: item.metadata_nonce,
    metadata_version: item.metadata_version,
    expires_at: item.expires_at,
    expiry_type: item.expiry_type,
    recipient_addresses,
    recipient_names,
    reply_to: extract_reply_to(envelope.raw_headers),
    send_status: effective_metadata.send_status,
    send_error: item.send_error,
    size_bytes:
      effective_metadata.size_bytes ||
      Math.ceil((item.encrypted_envelope?.length || 0) * 0.75),
    phishing_level: item.phishing_level,
  };
}

export function mail_to_email_safe(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  format_options: FormatOptions,
): InboxEmail | null {
  try {
    return mail_to_email(item, envelope, metadata, format_options);
  } catch {
    try {
      return mail_to_email(item, null, null, format_options);
    } catch {
      return null;
    }
  }
}

export interface FetchByIdsResult {
  emails: InboxEmail[];
  missing_ids: string[];
  unrenderable_ids: string[];
  request_ok: boolean;
}

export async function fetch_mail_by_ids_reconciled(
  ids: string[],
  format_options: FormatOptions,
  user_email = "",
): Promise<FetchByIdsResult> {
  if (ids.length === 0) {
    return {
      emails: [],
      missing_ids: [],
      unrenderable_ids: [],
      request_ok: true,
    };
  }

  const response = await list_mail_items({ ids });

  if (!response.data) {
    return {
      emails: [],
      missing_ids: [],
      unrenderable_ids: [],
      request_ok: false,
    };
  }

  const server_ids = new Set(response.data.items.map((item) => item.id));
  const missing_ids = ids.filter((id) => !server_ids.has(id));

  const results = await Promise.allSettled(
    response.data.items.map(async (item) => {
      const has_metadata = !!(item.encrypted_metadata && item.metadata_nonce);

      let envelope: DecryptedEnvelope | null = null;
      let metadata: MailItemMetadata | null = null;

      try {
        [envelope, metadata] = await Promise.all([
          decrypt_envelope(item.encrypted_envelope, item.envelope_nonce, item.id),
          has_metadata
            ? decrypt_mail_metadata(
                item.encrypted_metadata!,
                item.metadata_nonce!,
                item.metadata_version,
              )
            : Promise.resolve(null),
        ]);
      } catch {
        envelope = null;
        metadata = null;
      }

      if (envelope?.body_text) {
        try {
          const bundle = await decrypt_body_text_with_bundle(
            envelope.body_text,
            user_email,
            envelope.from?.email || "",
            item.id,
          );

          envelope.body_text = bundle.body;
          if (bundle.subject !== null && !envelope.subject) {
            envelope.subject = bundle.subject;
          }
        } catch {
          envelope.body_text = "";
        }
      }

      const email = mail_to_email_safe(
        item,
        envelope,
        metadata,
        format_options,
      );

      if (!email) throw new Error("unconvertible mail item");

      return email;
    }),
  );

  const by_id = new Map<string, InboxEmail>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      by_id.set(result.value.id, result.value);
    }
  }

  const emails = ids
    .map((id) => by_id.get(id))
    .filter((email): email is InboxEmail => email !== undefined);

  const unrenderable_ids = ids.filter(
    (id) => server_ids.has(id) && !by_id.has(id),
  );

  return { emails, missing_ids, unrenderable_ids, request_ok: true };
}

export function sort_emails_by_timestamp(
  emails: InboxEmail[],
  order: "asc" | "desc",
): InboxEmail[] {
  return [...emails].sort((a, b) => {
    const ts_a = new Date(a.raw_timestamp || a.timestamp).getTime();
    const ts_b = new Date(b.raw_timestamp || b.timestamp).getTime();

    return order === "asc" ? ts_a - ts_b : ts_b - ts_a;
  });
}

export interface RestoredEmailEntry {
  email: InboxEmail;
  index: number;
}

export function insert_emails_at(
  emails: InboxEmail[],
  entries: RestoredEmailEntry[],
): InboxEmail[] {
  const present = new Set(emails.map((e) => e.id));
  const fresh = entries
    .filter((entry) => !present.has(entry.email.id))
    .sort((a, b) => a.index - b.index);

  if (fresh.length === 0) return emails;

  const restored = [...emails];

  for (const entry of fresh) {
    const position = Math.min(Math.max(entry.index, 0), restored.length);

    restored.splice(position, 0, entry.email);
  }

  return restored;
}

export function collect_restore_entries(
  emails: InboxEmail[],
  ids: string[],
): RestoredEmailEntry[] {
  const id_set = new Set(ids);

  return emails
    .map((email, index) => ({ email, index }))
    .filter((entry) => id_set.has(entry.email.id));
}

export function expand_email_ids(email: InboxEmail): string[] {
  return email.grouped_email_ids && email.grouped_email_ids.length > 1
    ? email.grouped_email_ids
    : [email.id];
}

export function group_emails_by_thread(emails: InboxEmail[]): InboxEmail[] {
  const thread_map = new Map<string, InboxEmail>();
  const result: InboxEmail[] = [];

  for (const email of emails) {
    if (!email.thread_token) {
      result.push(email);
      continue;
    }

    const existing = thread_map.get(email.thread_token);

    if (!existing) {
      const grouped: InboxEmail = {
        ...email,
        grouped_email_ids: [email.id],
      };

      thread_map.set(email.thread_token, grouped);
      result.push(grouped);
    } else {
      existing.grouped_email_ids = [
        ...(existing.grouped_email_ids || [existing.id]),
        email.id,
      ];

      const existing_count = existing.thread_message_count ?? 1;
      const incoming_count = email.thread_message_count ?? 1;

      existing.thread_message_count = Math.max(existing_count, incoming_count);

      if (existing.is_read && !email.is_read) {
        existing.is_read = false;
      }

      if (!existing.has_attachment && email.has_attachment) {
        existing.has_attachment = true;
      }

      // The row must preview the newest message in the thread, not whichever
      // message happened to be encountered first. Promote the later message's
      // content onto the representative while keeping the aggregated thread
      // fields (grouped ids, count, read/attachment state, folders, tags).
      const existing_ts = new Date(
        existing.raw_timestamp || existing.timestamp,
      ).getTime();
      const incoming_ts = new Date(
        email.raw_timestamp || email.timestamp,
      ).getTime();

      if (
        Number.isFinite(incoming_ts) &&
        (!Number.isFinite(existing_ts) || incoming_ts > existing_ts)
      ) {
        existing.id = email.id;
        existing.subject = email.subject;
        existing.preview = email.preview;
        existing.body_html = email.body_html;
        existing.sender_name = email.sender_name;
        existing.sender_email = email.sender_email;
        existing.display_sender_name = email.display_sender_name;
        existing.display_sender_email = email.display_sender_email;
        existing.avatar_url = email.avatar_url;
        existing.timestamp = email.timestamp;
        existing.raw_timestamp = email.raw_timestamp;
        existing.item_type = email.item_type;
        existing.recipient_names = email.recipient_names;
        existing.recipient_addresses = email.recipient_addresses;
        existing.reply_to = email.reply_to;
        existing.mail_category = email.mail_category;
        existing.send_status = email.send_status;
        existing.snoozed_until = email.snoozed_until;
      }

      if (email.folders && email.folders.length > 0) {
        const existing_tokens = new Set(
          (existing.folders || []).map((f) => f.folder_token),
        );
        const merged_folders = [...(existing.folders || [])];

        for (const folder of email.folders) {
          if (!existing_tokens.has(folder.folder_token)) {
            merged_folders.push(folder);
          }
        }

        existing.folders = merged_folders;
      }

      if (email.tags && email.tags.length > 0) {
        const existing_tag_ids = new Set(
          (existing.tags || []).map((t) => t.id),
        );
        const merged_tags = [...(existing.tags || [])];

        for (const tag of email.tags) {
          if (!existing_tag_ids.has(tag.id)) {
            merged_tags.push(tag);
          }
        }

        existing.tags = merged_tags;
      }
    }
  }

  return result;
}

export async function fetch_mail_from_api(
  view: string,
  signal: AbortSignal,
  format_options: FormatOptions,
  user_email = "",
  limit = DEFAULT_PAGE_SIZE,
  cursor?: string,
  offset?: number,
  conversation_grouping = true,
  sort_order: "newest_first" | "oldest_first" = "newest_first",
): Promise<{
  emails: InboxEmail[];
  total: number;
  has_more: boolean;
  next_cursor?: string;
  raw_consumed: number;
} | null> {
  const should_group =
    conversation_grouping && view !== "scheduled" && view !== "snoozed";
  const order = sort_order === "oldest_first" ? "asc" : "desc";
  const category_index_module =
    view === "inbox" ? await import("@/services/category_index") : null;
  const index_generation = category_index_module?.get_index_generation();

  const params: ListMailItemsParams = {
    limit,
    order,
    ...VIEW_PARAMS[view as MailView],
    ...(offset !== undefined ? { offset } : cursor ? { cursor } : {}),
    ...(offset !== undefined ? { group_by_thread: should_group } : {}),
    ...((offset !== undefined && offset > 0) || cursor
      ? { skip_total: true }
      : {}),
  };

  if (view.startsWith("folder-")) {
    params.label_token = view.replace("folder-", "");
    delete params.item_type;
  } else if (view.startsWith("tag-")) {
    params.tag_token = view.replace("tag-", "");
    delete params.item_type;
  } else if (view.startsWith("alias-")) {
    const alias_address = view.replace("alias-", "");
    const alias_hash = get_alias_hash_by_address(alias_address);

    if (alias_hash) {
      params.routing_token = alias_hash;
    }
    delete params.item_type;
  } else if (!VIEW_PARAMS[view as MailView]) {
    params.item_type = "received";
  }

  const response = await list_mail_items(params);

  if (signal.aborted || !response.data) return null;

  const returned_items = response.data.items;
  const items = returned_items.filter((item) => item.is_reaction !== true);
  const hidden_count = returned_items.length - items.length;
  const raw_total = response.data.total ?? 0;
  const total_is_unknown = raw_total < 0;
  let total = total_is_unknown
    ? UNKNOWN_TOTAL
    : Math.max(0, raw_total - hidden_count);
  let has_more = response.data.has_more;
  let next_cursor = response.data.next_cursor;
  let raw_consumed = returned_items.length;

  const process_items = async (batch: MailItem[]) => {
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        if (signal.aborted) throw new Error("aborted");

        const has_metadata = !!(item.encrypted_metadata && item.metadata_nonce);

        const [envelope, metadata] = await Promise.all([
          decrypt_envelope(item.encrypted_envelope, item.envelope_nonce, item.id),
          has_metadata
            ? decrypt_mail_metadata(
                item.encrypted_metadata!,
                item.metadata_nonce!,
                item.metadata_version,
              )
            : Promise.resolve(null),
        ]);

        if (envelope?.body_text) {
          const bundle = await decrypt_body_text_with_bundle(
            envelope.body_text,
            user_email,
            envelope.from?.email || "",
            item.id,
          );

          envelope.body_text = bundle.body;
          if (bundle.subject !== null && !envelope.subject) {
            envelope.subject = bundle.subject;
          }
        }

        return { item, envelope, metadata };
      }),
    );

    if (signal.aborted) return null;

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
      .map((r) => r.value)
      .filter(({ envelope }) => {
        const is_reaction_body =
          is_reaction_payload_body(envelope?.body_text) ||
          is_reaction_payload_body(envelope?.text_body);

        if (is_reaction_body && !total_is_unknown) {
          total = Math.max(0, total - 1);
        }

        return !is_reaction_body;
      });

    const sender_emails = successful
      .map(({ envelope }) => envelope?.from?.email)
      .filter((e): e is string => !!e);

    if (sender_emails.length > 0) {
      await resolve_sender_profiles(sender_emails);
    }

    let emails = successful
      .map(({ item, envelope, metadata }) =>
        mail_to_email_safe(item, envelope, metadata, format_options),
      )
      .filter((email): email is InboxEmail => email !== null);

    if (view === "inbox" && category_index_module) {
      const index_entries = successful
        .filter(({ envelope }) => !!envelope)
        .filter(
          ({ item, metadata }) =>
            !category_index_module.is_item_outside_inbox(item) &&
            !metadata?.is_trashed &&
            !metadata?.is_archived &&
            !metadata?.is_spam,
        )
        .flatMap(({ item, envelope, metadata }) => {
          try {
            return [
              {
                id: item.id,
                thread_token: item.thread_token,
                message_ts: item.message_ts || item.created_at,
                is_read: item.is_read === true || (metadata?.is_read ?? false),
                category: classify(envelope!, metadata, {
                  rule_category: item.rule_category,
                }),
                category_pinned:
                  metadata?.category_pinned === true &&
                  !!metadata?.category &&
                  !is_locked_to_primary(envelope!),
              },
            ];
          } catch {
            return [];
          }
        });

      if (index_entries.length > 0) {
        category_index_module.upsert_entries(
          index_entries,
          index_generation,
          true,
        );
      }
    }

    emails = emails.filter((e) =>
      should_keep_email_in_view(
        {
          is_trashed: e.is_trashed,
          is_spam: e.is_spam,
          is_archived: e.is_archived,
          item_type: e.item_type,
          snoozed_until: e.snoozed_until,
        },
        view,
      ),
    );

    return emails;
  };

  const first_batch = await process_items(items);

  if (first_batch === null) return null;

  const collected: InboxEmail[] = [...first_batch];
  const supports_top_up = offset !== undefined;

  let top_up_rounds = 0;

  while (
    supports_top_up &&
    has_more &&
    collected.length < limit &&
    top_up_rounds < MAX_PAGE_TOP_UP_ROUNDS
  ) {
    top_up_rounds += 1;

    const top_up_response = await list_mail_items({
      ...params,
      limit: limit - collected.length,
      offset: offset + raw_consumed,
      skip_total: true,
    });

    if (signal.aborted) return null;
    if (!top_up_response.data) break;

    const top_up_returned = top_up_response.data.items;

    if (top_up_returned.length === 0) {
      has_more = top_up_response.data.has_more;
      break;
    }

    raw_consumed += top_up_returned.length;
    has_more = top_up_response.data.has_more;
    next_cursor = top_up_response.data.next_cursor;

    const seen_ids = new Set(collected.map((e) => e.id));
    const top_up_batch = await process_items(
      top_up_returned.filter((item) => item.is_reaction !== true),
    );

    if (top_up_batch === null) return null;

    collected.push(...top_up_batch.filter((e) => !seen_ids.has(e.id)));
  }

  const sorted_emails = sort_emails_by_timestamp(collected, order);

  const final_emails = should_group
    ? group_emails_by_thread(sorted_emails)
    : sorted_emails;

  return { emails: final_emails, total, has_more, next_cursor, raw_consumed };
}
