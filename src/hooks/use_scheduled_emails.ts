import type { InboxEmail, MailItemType } from "@/types/email";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import {
  MAIL_EVENTS,
  type ScheduledChangedEventDetail,
  emit_scheduled_changed,
  emit_scheduled_cancelled,
} from "./mail_events";
import { invalidate_mail_stats } from "./use_mail_stats";

import { strip_html_tags } from "@/lib/html_sanitizer";
import {
  list_scheduled_emails,
  get_scheduled_email,
  cancel_scheduled_email,
  type ScheduledEmailWithContent,
  type ScheduledEmailStatus,
} from "@/services/api/scheduled";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  format_time,
  format_weekday_short,
  format_date_short,
  type FormatOptions,
} from "@/utils/date_format";

const SCHEDULED_FETCH_LIMIT = 50;
const FETCH_TIMEOUT_MS = 15_000;

const SCHEDULED_CATEGORY_STYLE =
  "bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-500";

export interface ScheduledListItem extends InboxEmail {
  scheduled_at: string;
  status: ScheduledEmailStatus;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  full_body: string;
}

export interface ScheduledListState {
  emails: ScheduledListItem[];
  is_loading: boolean;
  total_count: number;
  has_more: boolean;
  error: string | null;
}

interface UseScheduledEmailsReturn {
  state: ScheduledListState;
  refresh: () => void;
  update_scheduled: (id: string, updates: Partial<ScheduledListItem>) => void;
  cancel_email: (id: string) => Promise<boolean>;
  bulk_cancel: (ids: string[]) => Promise<boolean>;
}

function format_scheduled_timestamp(
  date: Date,
  options: FormatOptions,
): string {
  const hours_until = (date.getTime() - Date.now()) / 3600000;

  if (hours_until < 0) {
    return "Sending...";
  }

  if (hours_until < 1) {
    const minutes = Math.round(hours_until * 60);

    return minutes <= 1 ? "In 1 min" : `In ${minutes} mins`;
  }

  if (hours_until < 24) {
    return format_time(date, options);
  }

  if (hours_until < 168) {
    return `${format_weekday_short(date)} ${format_time(date, options)}`;
  }

  return `${format_date_short(date, options)} ${format_time(date, options)}`;
}

function transform_scheduled(
  scheduled: ScheduledEmailWithContent,
  format_options: FormatOptions,
): ScheduledListItem {
  const recipients =
    scheduled.content.to_recipients.join(", ") || "No recipients";
  const display_name =
    recipients.length > 30 ? `${recipients.substring(0, 30)}...` : recipients;

  return {
    id: scheduled.id,
    item_type: "scheduled" as MailItemType,
    sender_name: display_name,
    sender_email: scheduled.content.to_recipients[0] || "",
    subject: scheduled.content.subject || "(No subject)",
    preview: strip_html_tags(scheduled.content.body).substring(0, 100),
    timestamp: format_scheduled_timestamp(
      new Date(scheduled.scheduled_at),
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
    category: "Scheduled",
    category_color: SCHEDULED_CATEGORY_STYLE,
    avatar_url: "",
    is_encrypted: true,
    scheduled_at: scheduled.scheduled_at,
    status: scheduled.status,
    to_recipients: scheduled.content.to_recipients,
    cc_recipients: scheduled.content.cc_recipients,
    bcc_recipients: scheduled.content.bcc_recipients,
    full_body: scheduled.content.body,
  };
}

async function fetch_scheduled_from_api(
  signal: AbortSignal,
  format_options: FormatOptions,
): Promise<{ emails: ScheduledListItem[]; has_more: boolean } | null> {
  const vault = get_vault_from_memory();

  if (!vault) return null;

  const response = await list_scheduled_emails(SCHEDULED_FETCH_LIMIT);

  if (signal.aborted || !response.data) return null;

  const results = await Promise.allSettled(
    response.data.emails.map(async (email) => {
      if (signal.aborted) throw new Error("aborted");
      const detail = await get_scheduled_email(email.id, vault);

      return detail.data
        ? transform_scheduled(detail.data, format_options)
        : null;
    }),
  );

  if (signal.aborted) return null;

  const emails = results
    .filter(
      (r): r is PromiseFulfilledResult<ScheduledListItem | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((e): e is ScheduledListItem => e !== null)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );

  return { emails, has_more: response.data.has_more };
}

export function use_scheduled_emails(
  is_active: boolean,
): UseScheduledEmailsReturn {
  const { has_keys, is_loading: auth_loading, is_authenticated } = use_auth();
  const { preferences } = use_preferences();
  const [emails, set_emails] = useState<ScheduledListItem[]>([]);
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

  const fetch_scheduled = useCallback(async () => {
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
      const result = await fetch_scheduled_from_api(signal, format_options);

      clearTimeout(timeout_id);

      if (signal.aborted) return;

      if (result) {
        set_emails(result.emails);
        set_has_more(result.has_more);
        invalidate_mail_stats();
      } else {
        set_error("Failed to load scheduled emails");
      }
    } catch {
      if (!signal.aborted) {
        set_error("Failed to load scheduled emails");
      }
    } finally {
      if (!signal.aborted) {
        set_is_loading(false);
      }
    }
  }, [format_options]);

  const refresh = useCallback(() => {
    fetch_scheduled();
  }, [fetch_scheduled]);

  const update_scheduled = useCallback(
    (id: string, updates: Partial<ScheduledListItem>) => {
      set_emails((prev) =>
        prev.map((email) =>
          email.id === id ? { ...email, ...updates } : email,
        ),
      );
    },
    [],
  );

  const remove_from_state = useCallback((ids: string[]) => {
    const id_set = new Set(ids);

    set_emails((prev) => prev.filter((e) => !id_set.has(e.id)));
  }, []);

  const cancel_single = useCallback(
    async (id: string): Promise<boolean> => {
      remove_from_state([id]);
      const result = await cancel_scheduled_email(id);

      if (result.data?.success) {
        invalidate_mail_stats();
        emit_scheduled_cancelled({ email_id: id });
        emit_scheduled_changed({ action: "cancelled", email_id: id });

        return true;
      }
      refresh();

      return false;
    },
    [remove_from_state, refresh],
  );

  const bulk_cancel = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (ids.length === 0) return true;

      remove_from_state(ids);
      const results = await Promise.allSettled(
        ids.map((id) => cancel_scheduled_email(id)),
      );
      const success = results.every(
        (r) => r.status === "fulfilled" && r.value.data?.success,
      );

      invalidate_mail_stats();

      ids.forEach((id) => {
        emit_scheduled_cancelled({ email_id: id });
      });
      emit_scheduled_changed({ action: "cancelled" });

      if (!success) refresh();

      return success;
    },
    [remove_from_state, refresh],
  );

  useEffect(() => {
    if (auth_loading || !is_active) return;

    if (has_keys && get_vault_from_memory()) {
      fetch_scheduled();
    } else if (!has_keys) {
      set_is_loading(false);
      set_emails([]);
    }

    return () => abort_ref.current?.abort();
  }, [auth_loading, has_keys, is_authenticated, is_active, fetch_scheduled]);

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
        fetch_scheduled();
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
  }, [auth_loading, has_keys, is_active, fetch_scheduled]);

  useEffect(() => {
    if (!is_active) return;

    const handle_change = () => {
      if (has_keys && get_vault_from_memory()) {
        refresh();
      }
    };

    const handle_scheduled_changed = (
      event: CustomEvent<ScheduledChangedEventDetail>,
    ) => {
      if (event.detail.action === "created" || event.detail.action === "sent") {
        refresh();
      }
    };

    window.addEventListener(
      MAIL_EVENTS.SCHEDULED_CHANGED,
      handle_scheduled_changed as EventListener,
    );
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.SCHEDULED_CHANGED,
        handle_scheduled_changed as EventListener,
      );
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
    };
  }, [is_active, has_keys, refresh]);

  const state = useMemo(
    () => ({
      emails,
      is_loading,
      total_count: emails.length,
      has_more,
      error,
    }),
    [emails, is_loading, has_more, error],
  );

  return useMemo(
    () => ({
      state,
      refresh,
      update_scheduled,
      cancel_email: cancel_single,
      bulk_cancel,
    }),
    [state, refresh, update_scheduled, cancel_single, bulk_cancel],
  );
}

export function invalidate_scheduled_cache(): void {
  emit_scheduled_changed({ action: "updated" });
}
