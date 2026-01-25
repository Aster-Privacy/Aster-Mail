import type { InboxEmail, MailItemType } from "@/types/email";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import {
  MAIL_EVENTS,
  type DraftUpdatedEventDetail,
  emit_drafts_changed,
} from "./mail_events";
import { invalidate_mail_stats } from "./use_mail_stats";

import {
  list_drafts,
  get_draft,
  delete_draft,
  type DraftWithContent,
} from "@/services/api/multi_drafts";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";

const DRAFT_FETCH_LIMIT = 50;
const FETCH_TIMEOUT_MS = 15_000;

const DRAFT_CATEGORY_STYLE =
  "bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-500";

export interface DraftListItem extends InboxEmail {
  version: number;
  draft_type: string;
  reply_to_id?: string;
  forward_from_id?: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  full_message: string;
}

export interface DraftsListState {
  drafts: DraftListItem[];
  is_loading: boolean;
  total_count: number;
  has_more: boolean;
  error: string | null;
}

interface UseDraftsListReturn {
  state: DraftsListState;
  refresh: () => void;
  update_draft: (id: string, updates: Partial<DraftListItem>) => void;
  delete_draft: (id: string) => Promise<boolean>;
  bulk_delete_drafts: (ids: string[]) => Promise<boolean>;
}

function transform_draft(
  draft: DraftWithContent,
  format_options: FormatOptions,
): DraftListItem {
  const recipients = draft.content.to_recipients.join(", ") || "No recipients";
  const display_name =
    recipients.length > 30 ? `${recipients.substring(0, 30)}...` : recipients;

  return {
    id: draft.id,
    item_type: "draft" as MailItemType,
    sender_name: display_name,
    sender_email: draft.content.to_recipients[0] || "",
    subject: draft.content.subject || "(No subject)",
    preview: draft.content.message.substring(0, 100),
    timestamp: format_email_list_timestamp(
      new Date(draft.updated_at),
      format_options,
    ),
    is_pinned: false,
    is_starred: false,
    is_selected: false,
    is_read: true,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    has_attachment: false,
    category: "Draft",
    category_color: DRAFT_CATEGORY_STYLE,
    avatar_url: "",
    is_encrypted: true,
    version: draft.version,
    draft_type: draft.draft_type,
    reply_to_id: draft.reply_to_id,
    forward_from_id: draft.forward_from_id,
    to_recipients: draft.content.to_recipients,
    cc_recipients: draft.content.cc_recipients,
    bcc_recipients: draft.content.bcc_recipients,
    full_message: draft.content.message,
  };
}

async function fetch_drafts_from_api(
  signal: AbortSignal,
  format_options: FormatOptions,
): Promise<{ drafts: DraftListItem[]; has_more: boolean } | null> {
  const vault = get_vault_from_memory();

  if (!vault) return null;

  const response = await list_drafts(DRAFT_FETCH_LIMIT);

  if (signal.aborted || !response.data) return null;

  const results = await Promise.allSettled(
    response.data.drafts.map(async (draft) => {
      if (signal.aborted) throw new Error("aborted");
      const detail = await get_draft(draft.id, vault);

      return detail.data ? transform_draft(detail.data, format_options) : null;
    }),
  );

  if (signal.aborted) return null;

  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );

  void rejected.length;

  const drafts = results
    .filter(
      (r): r is PromiseFulfilledResult<DraftListItem | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((d): d is DraftListItem => d !== null);

  return { drafts, has_more: response.data.has_more };
}

export function use_drafts_list(is_active: boolean): UseDraftsListReturn {
  const { has_keys, is_loading: auth_loading, is_authenticated } = use_auth();
  const { preferences } = use_preferences();
  const [drafts, set_drafts] = useState<DraftListItem[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [has_more, set_has_more] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const abort_ref = useRef<AbortController | null>(null);
  const vault_check_ref = useRef<NodeJS.Timeout | null>(null);

  const format_options: FormatOptions = useMemo(
    () => ({
      date_format: preferences.date_format as FormatOptions["date_format"],
      time_format: preferences.time_format,
    }),
    [preferences.date_format, preferences.time_format],
  );

  const fetch_drafts = useCallback(async () => {
    if (!get_vault_from_memory()) {
      set_is_loading(false);

      return;
    }

    abort_ref.current?.abort();
    abort_ref.current = new AbortController();
    const { signal } = abort_ref.current;

    set_is_loading(true);
    set_error(null);

    const timeout_id = setTimeout(
      () => abort_ref.current?.abort(),
      FETCH_TIMEOUT_MS,
    );

    try {
      const result = await fetch_drafts_from_api(signal, format_options);

      clearTimeout(timeout_id);

      if (signal.aborted) return;

      if (result) {
        set_drafts(result.drafts);
        set_has_more(result.has_more);
        invalidate_mail_stats();
      } else {
        set_error("Failed to load drafts");
      }
    } catch {
      if (!signal.aborted) {
        set_error("Failed to load drafts");
      }
    } finally {
      if (!signal.aborted) {
        set_is_loading(false);
      }
    }
  }, [format_options]);

  const refresh = useCallback(() => {
    fetch_drafts();
  }, [fetch_drafts]);

  const update_draft = useCallback(
    (id: string, updates: Partial<DraftListItem>) => {
      set_drafts((prev) =>
        prev.map((draft) =>
          draft.id === id ? { ...draft, ...updates } : draft,
        ),
      );
    },
    [],
  );

  const remove_from_state = useCallback((ids: string[]) => {
    const id_set = new Set(ids);

    set_drafts((prev) => prev.filter((d) => !id_set.has(d.id)));
  }, []);

  const delete_single = useCallback(
    async (id: string): Promise<boolean> => {
      remove_from_state([id]);
      const result = await delete_draft(id);

      if (result.data?.success) {
        invalidate_mail_stats();

        return true;
      }
      refresh();

      return false;
    },
    [remove_from_state, refresh],
  );

  const bulk_delete = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (ids.length === 0) return true;

      remove_from_state(ids);
      const results = await Promise.allSettled(
        ids.map((id) => delete_draft(id)),
      );
      const success = results.every(
        (r) => r.status === "fulfilled" && r.value.data?.success,
      );

      invalidate_mail_stats();
      if (!success) refresh();

      return success;
    },
    [remove_from_state, refresh],
  );

  useEffect(() => {
    if (auth_loading || !is_active) return;

    if (has_keys && get_vault_from_memory()) {
      fetch_drafts();
    } else if (!has_keys) {
      set_is_loading(false);
      set_drafts([]);
    }

    return () => abort_ref.current?.abort();
  }, [auth_loading, has_keys, is_authenticated, is_active, fetch_drafts]);

  useEffect(() => {
    if (auth_loading || !is_active || !has_keys) return;
    if (get_vault_from_memory()) return;

    if (vault_check_ref.current) {
      clearInterval(vault_check_ref.current);
    }

    set_is_loading(true);
    let attempts = 0;
    const max_attempts = 20;

    vault_check_ref.current = setInterval(() => {
      attempts++;

      if (get_vault_from_memory()) {
        if (vault_check_ref.current) {
          clearInterval(vault_check_ref.current);
          vault_check_ref.current = null;
        }
        fetch_drafts();
      } else if (attempts >= max_attempts) {
        if (vault_check_ref.current) {
          clearInterval(vault_check_ref.current);
          vault_check_ref.current = null;
        }
        set_is_loading(false);
      }
    }, 100);

    return () => {
      if (vault_check_ref.current) {
        clearInterval(vault_check_ref.current);
        vault_check_ref.current = null;
      }
    };
  }, [auth_loading, has_keys, is_active, fetch_drafts]);

  const update_draft_in_list = useCallback(
    (detail: DraftUpdatedEventDetail) => {
      set_drafts((prev) =>
        prev.map((draft) => {
          if (draft.id !== detail.id) return draft;

          const recipients = detail.to_recipients.join(", ") || "No recipients";
          const display_name =
            recipients.length > 30
              ? `${recipients.substring(0, 30)}...`
              : recipients;

          return {
            ...draft,
            version: detail.version,
            sender_name: display_name,
            sender_email: detail.to_recipients[0] || "",
            subject: detail.subject || "(No subject)",
            preview: detail.message.substring(0, 100),
            timestamp: format_email_list_timestamp(new Date(), {
              date_format: "MM/DD/YYYY",
              time_format: "12h",
            }),
            to_recipients: detail.to_recipients,
            cc_recipients: detail.cc_recipients,
            bcc_recipients: detail.bcc_recipients,
            full_message: detail.message,
          };
        }),
      );
    },
    [],
  );

  const debounced_refresh_ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!is_active) return;

    const handle_change = () => {
      if (debounced_refresh_ref.current) {
        clearTimeout(debounced_refresh_ref.current);
      }
      debounced_refresh_ref.current = setTimeout(() => {
        if (has_keys && get_vault_from_memory()) {
          refresh();
        }
        debounced_refresh_ref.current = null;
      }, 500);
    };

    const handle_draft_updated = (
      event: CustomEvent<DraftUpdatedEventDetail>,
    ) => {
      update_draft_in_list(event.detail);
    };

    window.addEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
    window.addEventListener(
      MAIL_EVENTS.DRAFT_UPDATED,
      handle_draft_updated as EventListener,
    );

    return () => {
      if (debounced_refresh_ref.current) {
        clearTimeout(debounced_refresh_ref.current);
        debounced_refresh_ref.current = null;
      }
      window.removeEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
      window.removeEventListener(
        MAIL_EVENTS.DRAFT_UPDATED,
        handle_draft_updated as EventListener,
      );
    };
  }, [is_active, has_keys, refresh, update_draft_in_list]);

  const state = useMemo(
    () => ({
      drafts,
      is_loading,
      total_count: drafts.length,
      has_more,
      error,
    }),
    [drafts, is_loading, has_more, error],
  );

  return useMemo(
    () => ({
      state,
      refresh,
      update_draft,
      delete_draft: delete_single,
      bulk_delete_drafts: bulk_delete,
    }),
    [state, refresh, update_draft, delete_single, bulk_delete],
  );
}

export function invalidate_drafts_cache(): void {
  emit_drafts_changed();
}
