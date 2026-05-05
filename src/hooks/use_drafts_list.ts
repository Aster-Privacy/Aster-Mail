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

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import {
  MAIL_EVENTS,
  type DraftUpdatedEventDetail,
  on_mail_event,
  emit_drafts_changed,
} from "./mail_events";
import { invalidate_mail_stats, adjust_stats_drafts } from "./use_mail_stats";

import {
  list_drafts,
  get_draft,
  delete_draft,
  type DraftWithContent,
  type DraftAttachmentData,
} from "@/services/api/multi_drafts";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";
import { strip_html_tags } from "@/lib/html_sanitizer";
import { use_i18n } from "@/lib/i18n/context";
import { show_action_toast } from "@/components/toast/action_toast";

const DRAFT_FETCH_LIMIT = 50;
const FETCH_TIMEOUT_MS = 15_000;
const UNDO_WINDOW_MS = 6_000;

const PENDING_DELETES_KEY = "aster_draft_pending_deletes";

interface PersistedDelete {
  ids: string[];
  scheduled_at: number;
}

function read_persisted_deletes(): PersistedDelete[] {
  try {
    const raw = localStorage.getItem(PENDING_DELETES_KEY);
    return raw ? (JSON.parse(raw) as PersistedDelete[]) : [];
  } catch {
    return [];
  }
}

function write_persisted_deletes(entries: PersistedDelete[]) {
  try {
    if (entries.length === 0) localStorage.removeItem(PENDING_DELETES_KEY);
    else localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(entries));
  } catch {}
}

function add_to_persisted_deletes(ids: string[], scheduled_at: number) {
  const existing = read_persisted_deletes().filter(
    (e) => !e.ids.some((id) => ids.includes(id)),
  );
  write_persisted_deletes([...existing, { ids, scheduled_at }]);
}

function remove_from_persisted_deletes(ids: string[]) {
  const id_set = new Set(ids);
  write_persisted_deletes(
    read_persisted_deletes().filter((e) => !e.ids.some((id) => id_set.has(id))),
  );
}

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
  updated_at: string;
  draft_attachments?: DraftAttachmentData[];
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
  schedule_delete_drafts: (ids: string[]) => () => void;
}

function transform_draft(
  draft: DraftWithContent,
  format_options: FormatOptions,
  no_recipients_text: string,
  no_subject_text: string,
  draft_category_text: string,
): DraftListItem {
  const recipients =
    draft.content.to_recipients.join(", ") || no_recipients_text;
  const display_name =
    recipients.length > 30 ? `${recipients.substring(0, 30)}...` : recipients;

  return {
    id: draft.id,
    item_type: "draft" as MailItemType,
    sender_name: display_name,
    sender_email: draft.content.to_recipients[0] || "",
    subject: draft.content.subject || no_subject_text,
    preview: strip_html_tags(draft.content.message).substring(0, 100),
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
    has_attachment: (draft.content.attachments?.length ?? 0) > 0,
    category: draft_category_text,
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
    updated_at: draft.updated_at,
    draft_attachments: draft.content.attachments,
  };
}

async function fetch_drafts_from_api(
  signal: AbortSignal,
  format_options: FormatOptions,
  no_recipients_text: string,
  no_subject_text: string,
  draft_category_text: string,
): Promise<{ drafts: DraftListItem[]; has_more: boolean } | null> {
  const vault = get_vault_from_memory();

  if (!vault) return null;

  const response = await list_drafts(DRAFT_FETCH_LIMIT);

  if (signal.aborted || !response.data) return null;

  const results = await Promise.allSettled(
    response.data.drafts.map(async (draft) => {
      if (signal.aborted) throw new Error("aborted");
      const detail = await get_draft(draft.id, vault);

      return detail.data
        ? transform_draft(
            detail.data,
            format_options,
            no_recipients_text,
            no_subject_text,
            draft_category_text,
          )
        : null;
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
  const { t } = use_i18n();
  const { has_keys, is_loading: auth_loading, is_authenticated } = use_auth();
  const { preferences } = use_preferences();
  const [drafts, set_drafts] = useState<DraftListItem[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [has_more, set_has_more] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const [suppressed_ids, set_suppressed_ids] = useState<ReadonlySet<string>>(new Set());

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
      const result = await fetch_drafts_from_api(
        signal,
        format_options,
        t("common.no_recipients"),
        t("mail.no_subject"),
        t("common.draft_category"),
      );

      clearTimeout(timeout_id);

      if (signal.aborted) return;

      if (result) {
        set_drafts(result.drafts);
        set_has_more(result.has_more);
        invalidate_mail_stats();
      } else {
        set_error(t("common.failed_to_load_drafts"));
      }
    } catch {
      if (!signal.aborted) {
        set_error(t("common.failed_to_load_drafts"));
      }
    } finally {
      set_is_loading(false);
    }
  }, [format_options, t]);

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

  const drafts_ref = useRef<DraftListItem[]>([]);

  drafts_ref.current = drafts;

  const pending_deletes = useRef<
    Map<string, { timer: number; draft: DraftListItem; position: number }>
  >(new Map());

  const schedule_delete_drafts = useCallback((ids: string[]): (() => void) => {
    if (ids.length === 0) return () => {};

    const id_set = new Set(ids);
    const snapshot = drafts_ref.current;
    const to_delete = snapshot
      .map((draft, position) =>
        id_set.has(draft.id) ? { draft, position } : null,
      )
      .filter(
        (entry): entry is { draft: DraftListItem; position: number } =>
          entry !== null,
      );

    if (to_delete.length === 0) return () => {};

    set_drafts((prev) => prev.filter((d) => !id_set.has(d.id)));
    adjust_stats_drafts(-to_delete.length);
    set_suppressed_ids((prev) => new Set([...prev, ...ids]));

    const scheduled_at = Date.now();
    add_to_persisted_deletes(ids, scheduled_at);

    for (const { draft, position } of to_delete) {
      const timer = window.setTimeout(() => {
        pending_deletes.current.delete(draft.id);
        remove_from_persisted_deletes([draft.id]);
        set_suppressed_ids((prev) => {
          const next = new Set(prev);
          next.delete(draft.id);
          return next;
        });
        delete_draft(draft.id)
          .then((result) => {
            if (result.data?.success) {
              invalidate_mail_stats();
            }
          })
          .catch(() => {});
      }, UNDO_WINDOW_MS);

      pending_deletes.current.set(draft.id, { timer, draft, position });
    }

    let undone = false;

    return () => {
      if (undone) return;
      undone = true;

      const restored: { draft: DraftListItem; position: number }[] = [];

      for (const { draft } of to_delete) {
        const pending = pending_deletes.current.get(draft.id);

        if (!pending) continue;
        clearTimeout(pending.timer);
        pending_deletes.current.delete(draft.id);
        restored.push({ draft: pending.draft, position: pending.position });
      }

      remove_from_persisted_deletes(ids);
      set_suppressed_ids((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });

      if (restored.length === 0) return;

      restored.sort((a, b) => a.position - b.position);
      set_drafts((prev) => {
        const next = [...prev];

        for (const entry of restored) {
          const insert_at = Math.min(entry.position, next.length);

          next.splice(insert_at, 0, entry.draft);
        }

        return next;
      });
      adjust_stats_drafts(restored.length);
    };
  }, []);

  useEffect(() => {
    const persisted = read_persisted_deletes();
    if (persisted.length === 0) return;

    const now = Date.now();
    const to_suppress = new Set<string>();
    const expired_ids: string[] = [];
    const still_live: PersistedDelete[] = [];

    for (const entry of persisted) {
      if (now - entry.scheduled_at >= UNDO_WINDOW_MS) {
        expired_ids.push(...entry.ids);
      } else {
        still_live.push(entry);
        entry.ids.forEach((id) => to_suppress.add(id));
      }
    }

    if (expired_ids.length > 0) {
      for (const id of expired_ids) {
        delete_draft(id).catch(() => {});
      }
      remove_from_persisted_deletes(expired_ids);
      invalidate_mail_stats();
    }

    if (to_suppress.size === 0) return;

    set_suppressed_ids(to_suppress);
    adjust_stats_drafts(-to_suppress.size);

    const all_live_ids = still_live.flatMap((e) => e.ids);

    for (const entry of still_live) {
      const remaining_ms = UNDO_WINDOW_MS - (now - entry.scheduled_at);

      for (const id of entry.ids) {
        const timer = window.setTimeout(() => {
          pending_deletes.current.delete(id);
          remove_from_persisted_deletes([id]);
          set_suppressed_ids((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          delete_draft(id)
            .then((result) => {
              if (result.data?.success) invalidate_mail_stats();
            })
            .catch(() => {});
        }, remaining_ms);

        pending_deletes.current.set(id, {
          timer,
          draft: { id } as DraftListItem,
          position: 0,
        });
      }
    }

    const undo = () => {
      for (const id of all_live_ids) {
        const pending = pending_deletes.current.get(id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        pending_deletes.current.delete(id);
      }
      remove_from_persisted_deletes(all_live_ids);
      set_suppressed_ids((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        all_live_ids.forEach((id) => next.delete(id));
        return next;
      });
      adjust_stats_drafts(all_live_ids.length);
    };

    const count = all_live_ids.length;

    show_action_toast({
      message:
        count === 1
          ? t("common.draft_deleted")
          : t("common.drafts_deleted", { count }),
      action_type: "trash",
      email_ids: all_live_ids,
      on_undo: async () => {
        undo();
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

          const recipients =
            detail.to_recipients.join(", ") || t("common.no_recipients");
          const display_name =
            recipients.length > 30
              ? `${recipients.substring(0, 30)}...`
              : recipients;

          return {
            ...draft,
            version: detail.version,
            sender_name: display_name,
            sender_email: detail.to_recipients[0] || "",
            subject: detail.subject || t("mail.no_subject"),
            preview: strip_html_tags(detail.message).substring(0, 100),
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
    [t],
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

    const unsub_draft_updated = on_mail_event(
      MAIL_EVENTS.DRAFT_UPDATED,
      (detail) => {
        update_draft_in_list(detail);
      },
    );

    window.addEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);

    return () => {
      if (debounced_refresh_ref.current) {
        clearTimeout(debounced_refresh_ref.current);
        debounced_refresh_ref.current = null;
      }
      unsub_draft_updated();
      window.removeEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
    };
  }, [is_active, has_keys, refresh, update_draft_in_list]);

  useEffect(() => {
    if (!is_loading) return;
    const safety_timeout = setTimeout(() => {
      set_is_loading(false);
    }, 10_000);

    return () => clearTimeout(safety_timeout);
  }, [is_loading]);

  const visible_drafts = useMemo(
    () =>
      suppressed_ids.size > 0
        ? drafts.filter((d) => !suppressed_ids.has(d.id))
        : drafts,
    [drafts, suppressed_ids],
  );

  const state = useMemo(
    () => ({
      drafts: visible_drafts,
      is_loading,
      total_count: visible_drafts.length,
      has_more,
      error,
    }),
    [visible_drafts, is_loading, has_more, error],
  );

  return useMemo(
    () => ({
      state,
      refresh,
      update_draft,
      schedule_delete_drafts,
    }),
    [state, refresh, update_draft, schedule_delete_drafts],
  );
}

export function invalidate_drafts_cache(): void {
  emit_drafts_changed();
}
