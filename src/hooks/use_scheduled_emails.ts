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
import type { InboxEmail, MailItemType } from "@/types/email";
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import {
  MAIL_EVENTS,
  on_mail_event,
  emit_scheduled_changed,
  emit_scheduled_cancelled,
} from "./mail_events";
import { invalidate_mail_stats } from "./use_mail_stats";

import { strip_html_tags } from "@/lib/html_sanitizer";
import { build_list_preview } from "@/utils/preview_text";
import {
  list_scheduled_emails,
  get_scheduled_email,
  cancel_scheduled_email,
  type ScheduledEmail,
  type ScheduledEmailWithContent,
  type ScheduledEmailStatus,
} from "@/services/api/scheduled";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  format_time,
  format_weekday_short,
  format_date_short,
  type FormatOptions,
} from "@/utils/date_format";

const SCHEDULED_FETCH_LIMIT = 50;
const SCHEDULED_MAX_PAGES = 40;
const SCHEDULED_MAX_RESTARTS = 2;
const SCHEDULED_PAGE_OVERLAP = 5;
const FETCH_TIMEOUT_MS = 15_000;

const SCHEDULED_CATEGORY_STYLE =
  "bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-500";

let scheduled_cache: ScheduledListItem[] | null = null;

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

interface ScheduledTimestampLabels {
  sending: string;
  in_one_minute: string;
  in_x_minutes: (count: number) => string;
}

function format_scheduled_timestamp(
  date: Date,
  options: FormatOptions,
  labels: ScheduledTimestampLabels,
): string {
  const hours_until = (date.getTime() - Date.now()) / 3600000;

  if (hours_until < 0) {
    return labels.sending;
  }

  if (hours_until < 1) {
    const minutes = Math.round(hours_until * 60);

    return minutes <= 1 ? labels.in_one_minute : labels.in_x_minutes(minutes);
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
  labels: ScheduledTimestampLabels,
  t: (key: TranslationKey) => string,
): ScheduledListItem {
  const recipients =
    scheduled.content.to_recipients.join(", ") || t("common.no_recipients");
  const display_name =
    recipients.length > 30 ? `${recipients.substring(0, 30)}...` : recipients;

  return {
    id: scheduled.id,
    item_type: "scheduled" as MailItemType,
    sender_name: display_name,
    sender_email: scheduled.content.to_recipients[0] || "",
    subject: scheduled.content.subject || "",
    preview: build_list_preview(strip_html_tags(scheduled.content.body)),
    timestamp: format_scheduled_timestamp(
      new Date(scheduled.scheduled_at),
      format_options,
      labels,
    ),
    is_pinned: false,
    is_starred: false,
    is_selected: false,
    is_read: true,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    has_attachment: false,
    category: t("common.scheduled_category"),
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

const ACTIVE_SCHEDULED_STATUSES: ReadonlySet<ScheduledEmailStatus> = new Set([
  "pending",
  "sending",
  "failed",
]);

interface ScheduledListing {
  items: ScheduledEmail[];
  complete: boolean;
  failed: boolean;
}

interface ListingPass {
  offset: number;
  total: number | null;
  seen: Set<string>;
  settled: boolean;
}

function new_listing_pass(): ListingPass {
  return { offset: 0, total: null, seen: new Set(), settled: true };
}

async function list_all_scheduled(
  signal: AbortSignal,
  on_progress: () => void,
): Promise<ScheduledListing | null> {
  const by_id = new Map<string, ScheduledEmail>();
  let pass = new_listing_pass();
  let restarts = 0;
  let complete = false;
  let failed = false;

  for (let page = 0; page < SCHEDULED_MAX_PAGES; page++) {
    const response = await list_scheduled_emails(
      SCHEDULED_FETCH_LIMIT,
      pass.offset,
    );

    if (signal.aborted) return null;
    if (!response.data) {
      if (by_id.size === 0) return null;
      failed = true;
      break;
    }
    on_progress();

    const { emails, total } = response.data;

    if (pass.total !== null && total !== pass.total) pass.settled = false;
    if (
      pass.offset > 0 &&
      emails.length > 0 &&
      !emails.some((email) => pass.seen.has(email.id))
    ) {
      pass.settled = false;
    }
    pass.total = total;

    let added = 0;

    for (const email of emails) {
      if (!pass.seen.has(email.id)) added++;
      pass.seen.add(email.id);
      by_id.set(email.id, email);
    }

    if (!response.data.has_more) {
      if (pass.settled) {
        complete = true;
        break;
      }
      if (restarts >= SCHEDULED_MAX_RESTARTS) break;
      restarts++;
      pass = new_listing_pass();
      continue;
    }

    if (added === 0) break;
    pass.offset += Math.max(1, emails.length - SCHEDULED_PAGE_OVERLAP);
  }

  const items = Array.from(by_id.values()).filter((email) =>
    ACTIVE_SCHEDULED_STATUSES.has(email.status),
  );

  return { items, complete, failed };
}

async function fetch_scheduled_from_api(
  signal: AbortSignal,
  format_options: FormatOptions,
  labels: ScheduledTimestampLabels,
  t: (key: TranslationKey) => string,
  on_progress: () => void,
): Promise<{
  emails: ScheduledListItem[];
  has_more: boolean;
  failed: boolean;
} | null> {
  const vault = get_vault_from_memory();

  if (!vault) return null;

  const listing = await list_all_scheduled(signal, on_progress);

  if (signal.aborted || !listing) return null;

  const results: PromiseSettledResult<ScheduledListItem | null>[] = [];

  for (let i = 0; i < listing.items.length; i += SCHEDULED_FETCH_LIMIT) {
    const chunk = listing.items.slice(i, i + SCHEDULED_FETCH_LIMIT);
    const chunk_results = await Promise.allSettled(
      chunk.map(async (email) => {
        if (signal.aborted) throw new Error("aborted");
        const detail = await get_scheduled_email(email.id, vault);

        return detail.data
          ? transform_scheduled(detail.data, format_options, labels, t)
          : null;
      }),
    );

    if (signal.aborted) return null;
    on_progress();
    results.push(...chunk_results);
  }

  const has_loaded_detail = results.some(
    (r) => r.status === "fulfilled" && r.value !== null,
  );

  if (listing.items.length > 0 && !has_loaded_detail) return null;

  const emails = results
    .filter(
      (r): r is PromiseFulfilledResult<ScheduledListItem | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((e): e is ScheduledListItem => e !== null)
    .filter((e) => ACTIVE_SCHEDULED_STATUSES.has(e.status))
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );

  return { emails, has_more: !listing.complete, failed: listing.failed };
}

export function use_scheduled_emails(
  is_active: boolean,
): UseScheduledEmailsReturn {
  const { t } = use_i18n();
  const { has_keys, is_loading: auth_loading, is_authenticated } = use_auth();
  const { preferences } = use_preferences();
  const [emails, set_emails] = useState<ScheduledListItem[]>(
    () => scheduled_cache ?? [],
  );
  const [is_loading, set_is_loading] = useState(() => scheduled_cache === null);
  const [has_more, set_has_more] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const abort_ref = useRef<AbortController | null>(null);
  const vault_check_ref = useRef<NodeJS.Timeout | null>(null);
  const fetch_seq_ref = useRef(0);
  const mounted_ref = useRef(true);
  const has_loaded_ref = useRef(scheduled_cache !== null);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  const format_options: FormatOptions = useMemo(
    () => ({
      date_format: preferences.date_format as FormatOptions["date_format"],
      time_format: preferences.time_format,
      relative_dates: preferences.relative_dates !== false,
    }),
    [
      preferences.date_format,
      preferences.time_format,
      preferences.relative_dates,
    ],
  );

  const fetch_scheduled = useCallback(async () => {
    if (!get_vault_from_memory()) {
      set_is_loading(false);

      return;
    }

    abort_ref.current?.abort();
    const controller = new AbortController();

    abort_ref.current = controller;
    const { signal } = controller;
    const seq = ++fetch_seq_ref.current;
    const is_current = () =>
      seq === fetch_seq_ref.current && mounted_ref.current;

    if (!has_loaded_ref.current) set_is_loading(true);
    set_error(null);

    let timed_out = false;
    let timeout_id: ReturnType<typeof setTimeout> | undefined;

    const arm_timeout = () => {
      clearTimeout(timeout_id);
      timeout_id = setTimeout(() => {
        timed_out = true;
        controller.abort();
      }, FETCH_TIMEOUT_MS);
    };

    arm_timeout();

    try {
      const timestamp_labels: ScheduledTimestampLabels = {
        sending: t("common.sending"),
        in_one_minute: t("common.in_one_minute"),
        in_x_minutes: (count: number) => t("common.in_x_minutes", { count }),
      };

      const result = await fetch_scheduled_from_api(
        signal,
        format_options,
        timestamp_labels,
        t,
        arm_timeout,
      );

      if (signal.aborted || !is_current()) {
        if (timed_out && is_current()) {
          set_error(t("common.failed_to_load_scheduled_emails"));
        }

        return;
      }

      if (result && result.failed && has_loaded_ref.current) {
        set_error(t("common.failed_to_load_scheduled_emails"));
      } else if (result) {
        has_loaded_ref.current = true;
        set_emails(result.emails);
        set_has_more(result.has_more);
        if (result.failed) {
          set_error(t("common.failed_to_load_scheduled_emails"));
        }
        invalidate_mail_stats();
      } else {
        set_error(t("common.failed_to_load_scheduled_emails"));
      }
    } catch {
      if (is_current()) {
        set_error(t("common.failed_to_load_scheduled_emails"));
      }
    } finally {
      clearTimeout(timeout_id);
      if (is_current()) set_is_loading(false);
    }
  }, [format_options, t]);

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
      const succeeded_ids = ids.filter((_id, i) => {
        const r = results[i];

        return r.status === "fulfilled" && r.value.data?.success === true;
      });
      const success = succeeded_ids.length === ids.length;

      invalidate_mail_stats();

      succeeded_ids.forEach((id) => {
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
      scheduled_cache = null;
      has_loaded_ref.current = false;
      set_is_loading(true);
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

    if (!has_loaded_ref.current) set_is_loading(true);
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
        set_error(t("common.no_vault_available"));
        set_is_loading(false);
      }
    }, 100);

    return () => {
      if (vault_check_ref.current) {
        clearInterval(vault_check_ref.current);
        vault_check_ref.current = null;
      }
    };
  }, [auth_loading, has_keys, is_active, fetch_scheduled, t]);

  useEffect(() => {
    if (!is_active) return;

    const handle_change = () => {
      if (has_keys && get_vault_from_memory()) {
        refresh();
      }
    };

    const unsub_scheduled = on_mail_event(MAIL_EVENTS.SCHEDULED_CHANGED, () => {
      handle_change();
    });

    const handle_visibility = () => {
      if (document.visibilityState === "visible") {
        handle_change();
      }
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
    window.addEventListener(MAIL_EVENTS.MAIL_STATS_STALE, handle_change);
    document.addEventListener("visibilitychange", handle_visibility);

    return () => {
      unsub_scheduled();
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
      window.removeEventListener(MAIL_EVENTS.MAIL_STATS_STALE, handle_change);
      document.removeEventListener("visibilitychange", handle_visibility);
    };
  }, [is_active, has_keys, refresh]);

  useEffect(() => {
    if (has_keys && !is_loading && has_loaded_ref.current) {
      scheduled_cache = emails;
    }
  }, [emails, is_loading, has_keys]);

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

export function clear_scheduled_cache(): void {
  scheduled_cache = null;
}
