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
import type { InboxEmail, EmailListState, EmailCategory } from "@/types/email";
import type { FormatOptions } from "@/utils/date_format";
import type { UseEmailListReturn } from "./email_list_types";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from "react";

import {
  fetch_mail_by_ids_reconciled,
  group_emails_by_thread,
  DEFAULT_PAGE_SIZE,
} from "./email_list_helpers";
import { use_email_list_actions } from "./use_email_list_actions";
import { use_email_list_bulk } from "./use_email_list_bulk";
import { MAIL_EVENTS } from "./mail_events";
import { mark_preload_stale } from "@/components/email/hooks/preload_cache";

import {
  has_passphrase_in_memory,
  on_keys_ready,
} from "@/services/crypto/memory_key_store";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  init_category_index,
  get_page_ids,
  get_category_total,
  is_fully_built,
  is_build_in_progress,
  is_build_stalled,
  subscribe as subscribe_index,
  get_version as get_index_version,
  remove_ids,
  remove_thread_entries,
  reindex_ids,
  request_full_rebuild,
  is_representative_unread,
  sync_recent,
  set_sort_order,
  reconcile_server_read,
  get_thread_rep_id,
  set_thread_grouping,
} from "@/services/category_index";
import { get_thread_messages, trash_thread } from "@/services/api/mail";
import { batch_archive as api_batch_archive } from "@/services/api/archive";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import { emit_mail_soft_refresh } from "@/hooks/email_action_types";

const EMPTY_STATE: EmailListState = {
  emails: [],
  is_loading: true,
  is_loading_more: false,
  total_messages: 0,
  has_more: false,
  has_initial_load: false,
};

const MIN_REFRESH_SKELETON_MS = 550;
const MAX_FETCH_RETRIES = 4;
const FETCH_RETRY_DELAY_MS = 1500;

function build_list_state(
  prev: EmailListState,
  emails: InboxEmail[],
  total: number,
  has_more: boolean,
): EmailListState {
  const selected = new Set(
    prev.emails.filter((e) => e.is_selected).map((e) => e.id),
  );
  const next =
    selected.size > 0
      ? emails.map((e) =>
          selected.has(e.id) ? { ...e, is_selected: true } : e,
        )
      : emails;

  return {
    emails: next,
    is_loading: false,
    is_loading_more: false,
    total_messages: total,
    has_more,
    has_initial_load: true,
  };
}

export function use_category_inbox(
  active_category: EmailCategory,
  page: number,
  enabled: boolean,
): UseEmailListReturn {
  const { has_keys, user } = use_auth();
  const { preferences } = use_preferences();

  const index_version = useSyncExternalStore(
    subscribe_index,
    get_index_version,
    get_index_version,
  );

  useEffect(() => {
    set_sort_order(
      preferences.inbox_sort_order === "oldest_first" ? "asc" : "desc",
    );
  }, [preferences.inbox_sort_order]);

  useEffect(() => {
    set_thread_grouping(preferences.conversation_grouping !== false);
  }, [preferences.conversation_grouping]);

  const page_size = DEFAULT_PAGE_SIZE;

  const format_options: FormatOptions = useMemo(
    () => ({
      date_format: preferences.date_format as FormatOptions["date_format"],
      time_format: preferences.time_format,
    }),
    [preferences.date_format, preferences.time_format],
  );

  const [state, set_state] = useState<EmailListState>(EMPTY_STATE);

  const page_variant = useMemo(
    () =>
      `${preferences.conversation_grouping !== false ? "g1" : "g0"}~${format_options.date_format}~${format_options.time_format}`,
    [preferences.conversation_grouping, format_options],
  );

  useEffect(() => {
    const handle_item_update = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      mark_preload_stale(detail.id);

      const rep_id = get_thread_rep_id(detail.id);
      const affected_ids = new Set(
        rep_id && rep_id !== detail.id ? [detail.id, rep_id] : [detail.id],
      );

      for (const key of page_cache.current.keys()) {
        const ids_part = key.split(":").slice(4).join(":");
        const key_ids = ids_part.split(",");

        if (key_ids.some((id) => affected_ids.has(id))) {
          page_cache.current.delete(key);
        }
      }

      if (detail.is_trashed || detail.is_archived || detail.is_spam) {
        remove_ids([detail.id]);
        set_state((prev) => {
          const had_email = prev.emails.some((e) => e.id === detail.id);

          return {
            ...prev,
            emails: prev.emails.filter((e) => e.id !== detail.id),
            total_messages: had_email
              ? Math.max(0, prev.total_messages - 1)
              : prev.total_messages,
          };
        });

        return;
      }

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.map((e) =>
          e.id === detail.id ? { ...e, ...detail } : e,
        ),
      }));
    };
    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, handle_item_update);
    return () => window.removeEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, handle_item_update);
  }, [set_state]);

  const last_signature_ref = useRef<string>("");
  const abort_ref = useRef<AbortController | null>(null);
  const page_cache = useRef<Map<string, InboxEmail[]>>(new Map());
  const fetch_retry_ref = useRef<{ sig: string; attempts: number }>({
    sig: "",
    attempts: 0,
  });
  const fetch_retry_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const fetch_page_ref = useRef<
    ((page: number, limit: number, force?: boolean) => Promise<void>) | null
  >(null);

  useEffect(() => {
    return () => {
      if (fetch_retry_timer_ref.current) {
        clearTimeout(fetch_retry_timer_ref.current);
        fetch_retry_timer_ref.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!has_keys) return;
    if (!user?.email) return;

    const run = () => {
      page_cache.current.clear();
      last_signature_ref.current = "";
      void init_category_index();
    };

    return on_keys_ready(run);
  }, [enabled, has_keys, user?.email]);

  useEffect(() => {
    if (!state.is_loading) return;

    // Soft backstop: clear the skeleton once the index is idle (or has wedged).
    // A healthy build still in progress keeps the skeleton up.
    const soft = setTimeout(() => {
      if (is_build_in_progress() && !is_build_stalled()) return;
      if (is_build_stalled()) {
        void init_category_index();
      }
      set_state((prev) =>
        prev.is_loading
          ? { ...prev, is_loading: false, has_initial_load: true }
          : prev,
      );
    }, 10_000);

    // Hard backstop: never leave the user on an infinite skeleton, even if a
    // build cannot be recovered. The index recovers on tab focus; this just
    // guarantees the UI always resolves to content or an empty state.
    const hard = setTimeout(() => {
      set_state((prev) =>
        prev.is_loading
          ? { ...prev, is_loading: false, has_initial_load: true }
          : prev,
      );
    }, 30_000);

    return () => {
      clearTimeout(soft);
      clearTimeout(hard);
    };
  }, [state.is_loading]);

  const fetch_page = useCallback(
    async (target_page: number, limit: number): Promise<void> => {
      if (!enabled) return;
      if (!has_passphrase_in_memory()) {
        last_signature_ref.current = "";

        return;
      }

      const schedule_retry = (): boolean => {
        const retry_sig = `${active_category}|${target_page}`;
        const prev = fetch_retry_ref.current;
        const attempts = prev.sig === retry_sig ? prev.attempts : 0;

        if (attempts >= MAX_FETCH_RETRIES) return false;

        fetch_retry_ref.current = { sig: retry_sig, attempts: attempts + 1 };
        if (fetch_retry_timer_ref.current) {
          clearTimeout(fetch_retry_timer_ref.current);
        }
        fetch_retry_timer_ref.current = setTimeout(() => {
          fetch_retry_timer_ref.current = null;
          void fetch_page_ref.current?.(target_page, limit);
        }, FETCH_RETRY_DELAY_MS);

        return true;
      };

      const ids = get_page_ids(active_category, target_page, limit);
      const total = get_category_total(active_category);
      const has_more = (target_page + 1) * limit < total;

      abort_ref.current?.abort();

      if (ids.length === 0) {
        // Only show the empty state once the index is fully built and no build
        // is in progress; keep the skeleton while building so we never flash
        // "No <tab>" before content loads.
        const built = is_fully_built() && !is_build_in_progress();

        abort_ref.current = null;
        set_state({
          emails: [],
          is_loading: !built,
          is_loading_more: false,
          total_messages: total,
          has_more: false,
          has_initial_load: built,
        });

        return;
      }

      const controller = new AbortController();

      abort_ref.current = controller;

      const unread_bits = ids
        .map((id) => (is_representative_unread(id) ? "u" : "r"))
        .join("");
      const cache_key = `${active_category}:${target_page}:${page_variant}:${unread_bits}:${ids.join(",")}`;
      const cached = page_cache.current.get(cache_key);

      if (cached) {
        abort_ref.current = null;
        page_cache.current.delete(cache_key);
        page_cache.current.set(cache_key, cached);
        set_state((prev) => build_list_state(prev, cached, total, has_more));

        return;
      }

      set_state((prev) => ({ ...prev, is_loading: true }));

      try {
        const { emails: fetched, missing_ids, request_ok } =
          await fetch_mail_by_ids_reconciled(
            ids,
            format_options,
            user?.email || "",
          );

        if (controller.signal.aborted) return;

        if (!request_ok) {
          // The row fetch itself failed (network / edge / transient). Never
          // prune the index on a failed request, and never flash an empty
          // inbox that contradicts a positive count: retry with backoff, and
          // only resolve to an empty state once retries are exhausted.
          if (schedule_retry()) return;

          set_state((prev) => ({
            ...prev,
            is_loading: false,
            has_initial_load: true,
            has_load_error: prev.emails.length === 0,
          }));

          return;
        }

        fetch_retry_ref.current = { sig: `${active_category}|${target_page}`, attempts: 0 };
        if (fetch_retry_timer_ref.current) {
          clearTimeout(fetch_retry_timer_ref.current);
          fetch_retry_timer_ref.current = null;
        }

        if (missing_ids.length > 0) {
          remove_ids(missing_ids);
        }

        reconcile_server_read(fetched);

        const belongs_in_inbox = (email: InboxEmail) =>
          email.item_type === "received" &&
          !email.is_trashed &&
          !email.is_archived &&
          !email.is_spam &&
          (email.labels?.length ?? 0) === 0 &&
          (email.folders?.length ?? 0) === 0 &&
          (() => {
            if (!email.snoozed_until) return true;
            const wake_ms = new Date(email.snoozed_until).getTime();

            return Number.isNaN(wake_ms) || wake_ms <= Date.now();
          })();

        const stale_fetched = fetched
          .filter((email) => !belongs_in_inbox(email))
          .map((email) => email.id);

        if (stale_fetched.length > 0) {
          remove_ids(stale_fetched);
        }

        const received_only = fetched
          .filter(belongs_in_inbox)
          .map((email) =>
            email.is_read && is_representative_unread(email.id)
              ? { ...email, is_read: false }
              : email,
          );

        const grouped =
          preferences.conversation_grouping !== false
            ? group_emails_by_thread(received_only)
            : received_only;

        page_cache.current.set(cache_key, grouped);
        if (page_cache.current.size > 24) {
          const oldest = page_cache.current.keys().next().value;

          if (oldest) page_cache.current.delete(oldest);
        }

        const pruned =
          missing_ids.length > 0 || stale_fetched.length > 0;
        const effective_total = pruned
          ? get_category_total(active_category)
          : total;
        const effective_has_more =
          (target_page + 1) * limit < effective_total;

        set_state((prev) =>
          build_list_state(prev, grouped, effective_total, effective_has_more),
        );
      } catch {
        if (controller.signal.aborted) return;
        if (schedule_retry()) return;

        set_state((prev) => ({
          ...prev,
          is_loading: false,
          has_initial_load: true,
          has_load_error: prev.emails.length === 0,
        }));
      }
    },
    [
      enabled,
      active_category,
      format_options,
      user?.email,
      preferences.conversation_grouping,
      page_variant,
    ],
  );

  useEffect(() => {
    if (fetch_retry_timer_ref.current) {
      clearTimeout(fetch_retry_timer_ref.current);
      fetch_retry_timer_ref.current = null;
    }
    fetch_retry_ref.current = { sig: "", attempts: 0 };
  }, [active_category, page]);

  useEffect(() => {
    if (!enabled) return;

    const ids = get_page_ids(active_category, page, page_size);
    const built = is_fully_built() && !is_build_in_progress() ? "b1" : "b0";
    const unread_bits = ids
      .map((id) => (is_representative_unread(id) ? "u" : "r"))
      .join("");
    const signature = `${active_category}|${page}|${page_variant}|${built}|${unread_bits}|${ids.join(",")}`;

    if (signature === last_signature_ref.current) return;

    last_signature_ref.current = signature;
    void fetch_page(page, page_size);
  }, [
    enabled,
    active_category,
    page,
    page_size,
    index_version,
    fetch_page,
    page_variant,
  ]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const handle_refresh_requested = () => {
      if (!has_passphrase_in_memory()) return;
      page_cache.current.clear();
      last_signature_ref.current = "";
      set_state((prev) =>
        prev.is_loading ? prev : { ...prev, is_loading: true },
      );
      void (async () => {
        const started = Date.now();

        try {
          await sync_recent();
        } catch {
          void 0;
        }

        const elapsed = Date.now() - started;

        if (elapsed < MIN_REFRESH_SKELETON_MS) {
          await new Promise((resolve) =>
            setTimeout(resolve, MIN_REFRESH_SKELETON_MS - elapsed),
          );
        }

        if (cancelled) return;

        await fetch_page(page, page_size);
      })();
    };

    window.addEventListener(
      MAIL_EVENTS.REFRESH_REQUESTED,
      handle_refresh_requested,
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        MAIL_EVENTS.REFRESH_REQUESTED,
        handle_refresh_requested,
      );
    };
  }, [enabled, page, page_size, fetch_page]);

  const update_email = useCallback(
    (id: string, updates: Partial<InboxEmail>): void => {
      for (const key of page_cache.current.keys()) {
        const ids_part = key.split(":").slice(4).join(":");

        if (ids_part.split(",").includes(id)) {
          page_cache.current.delete(key);
        }
      }

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.map((e) =>
          e.id === id ? { ...e, ...updates } : e,
        ),
      }));
    },
    [],
  );

  const remove_email = useCallback((id: string): void => {
    remove_ids([id]);
    set_state((prev) => ({
      ...prev,
      emails: prev.emails.filter((e) => e.id !== id),
      total_messages: Math.max(0, prev.total_messages - 1),
    }));
  }, []);

  const remove_emails = useCallback((ids: string[]): void => {
    remove_ids(ids);
    const id_set = new Set(ids);

    set_state((prev) => ({
      ...prev,
      emails: prev.emails.filter((e) => !id_set.has(e.id)),
      total_messages: Math.max(0, prev.total_messages - ids.length),
    }));
  }, []);

  const refresh = useCallback(() => {
    page_cache.current.clear();
    last_signature_ref.current = "";
    void fetch_page(page, page_size);
  }, [fetch_page, page, page_size]);

  fetch_page_ref.current = fetch_page;

  const load_more = useCallback(async (): Promise<void> => {
    return;
  }, []);

  const {
    toggle_star,
    toggle_pin,
    mark_read,
    delete_email,
    archive_email,
    unarchive_email,
    mark_spam,
  } = use_email_list_actions({
    state,
    set_state,
    update_email,
    remove_email,
    refresh,
  });

  const raw_bulk = use_email_list_bulk({
    state,
    set_state,
    fetch_page_ref,
  });

  const finish_thread_action = useCallback(
    (
      email: InboxEmail | undefined,
      server_op: (sibling_ids: string[]) => Promise<boolean>,
    ): void => {
      if (!email?.thread_token) return;
      if ((email.thread_message_count ?? 1) <= 1) return;

      const token = email.thread_token;
      const removed = remove_thread_entries(token);

      void (async () => {
        try {
          const response = await get_thread_messages(token);
          const messages = response.data?.messages ?? [];
          const total = response.data?.thread?.message_count ?? messages.length;
          const sibling_ids = messages
            .filter(
              (message) =>
                message.item_type === "received" && message.id !== email.id,
            )
            .map((message) => message.id);

          if (sibling_ids.length > 0) {
            const ok = await server_op(sibling_ids);

            if (!ok) {
              reindex_ids(removed);

              return;
            }
          }

          // A thread larger than one message page could not be fully enumerated
          // here, so some siblings were never acted on server-side. Reconcile
          // the whole index against the server inbox instead of trusting the
          // optimistic thread removal.
          if (total > messages.length) {
            request_full_rebuild();

            return;
          }

          emit_mail_soft_refresh();
        } catch {
          reindex_ids(removed);
        }
      })();
    },
    [],
  );

  const delete_email_thread_aware = useCallback(
    async (id: string): Promise<void> => {
      const email = state.emails.find((e) => e.id === id);

      await delete_email(id);
      finish_thread_action(email, async () => {
        const result = await trash_thread(email!.thread_token!, true);

        return !!result.data;
      });
    },
    [state.emails, delete_email, finish_thread_action],
  );

  const archive_email_thread_aware = useCallback(
    async (id: string): Promise<void> => {
      const email = state.emails.find((e) => e.id === id);

      await archive_email(id);
      finish_thread_action(email, async (sibling_ids) => {
        const result = await api_batch_archive({
          ids: sibling_ids,
          tier: "hot",
        });

        if (result.data?.success) {
          void bulk_update_metadata_by_ids(sibling_ids, {
            is_archived: true,
          }).catch(() => {});
        }

        return !!result.data?.success;
      });
    },
    [state.emails, archive_email, finish_thread_action],
  );

  const mark_spam_thread_aware = useCallback(
    async (id: string): Promise<void> => {
      const email = state.emails.find((e) => e.id === id);

      await mark_spam(id);
      finish_thread_action(email, async (sibling_ids) => {
        const result = await bulk_update_metadata_by_ids(sibling_ids, {
          is_spam: true,
          is_trashed: false,
        });

        return result.success;
      });
    },
    [state.emails, mark_spam, finish_thread_action],
  );

  const bulk_delete = useCallback(
    async (ids: string[]): Promise<void> => {
      remove_ids(ids);
      await raw_bulk.bulk_delete(ids);
    },
    [raw_bulk],
  );

  const bulk_archive = useCallback(
    async (ids: string[]): Promise<void> => {
      const id_set = new Set(ids);
      const selected = state.emails.filter((e) => id_set.has(e.id));

      remove_ids(ids);
      await raw_bulk.bulk_archive(ids);
      for (const email of selected) {
        finish_thread_action(email, async (sibling_ids) => {
          const result = await api_batch_archive({
            ids: sibling_ids,
            tier: "hot",
          });

          if (result.data?.success) {
            void bulk_update_metadata_by_ids(sibling_ids, {
              is_archived: true,
            }).catch(() => {});
          }

          return !!result.data?.success;
        });
      }
    },
    [raw_bulk, state.emails, finish_thread_action],
  );

  return {
    state,
    fetch_page,
    load_more,
    update_email,
    remove_email,
    remove_emails,
    toggle_star,
    toggle_pin,
    mark_read,
    delete_email: delete_email_thread_aware,
    archive_email: archive_email_thread_aware,
    unarchive_email,
    mark_spam: mark_spam_thread_aware,
    bulk_delete,
    bulk_archive,
    bulk_unarchive: raw_bulk.bulk_unarchive,
    refresh,
  };
}
