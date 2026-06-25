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
  fetch_mail_by_ids,
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
  is_representative_unread,
  sync_recent,
} from "@/services/category_index";

const EMPTY_STATE: EmailListState = {
  emails: [],
  is_loading: true,
  is_loading_more: false,
  total_messages: 0,
  has_more: false,
  has_initial_load: false,
};

const MIN_REFRESH_SKELETON_MS = 550;

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

  const page_size = DEFAULT_PAGE_SIZE;

  const format_options: FormatOptions = useMemo(
    () => ({
      date_format: preferences.date_format as FormatOptions["date_format"],
      time_format: preferences.time_format,
    }),
    [preferences.date_format, preferences.time_format],
  );

  const [state, set_state] = useState<EmailListState>(EMPTY_STATE);

  useEffect(() => {
    const handle_item_update = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      mark_preload_stale(detail.id);

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

      const ids = get_page_ids(active_category, target_page, limit);
      const total = get_category_total(active_category);
      const has_more = (target_page + 1) * limit < total;

      if (ids.length === 0) {
        // Only show the empty state once the index is fully built and no build
        // is in progress; keep the skeleton while building so we never flash
        // "No <tab>" before content loads.
        const built = is_fully_built() && !is_build_in_progress();

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

      abort_ref.current?.abort();
      const controller = new AbortController();

      abort_ref.current = controller;

      const cache_key = `${active_category}:${target_page}:${ids.join(",")}`;
      const cached = page_cache.current.get(cache_key);

      if (cached) {
        abort_ref.current = null;
        set_state((prev) => build_list_state(prev, cached, total, has_more));

        return;
      }

      set_state((prev) => ({ ...prev, is_loading: true }));

      try {
        const fetched = await fetch_mail_by_ids(
          ids,
          format_options,
          user?.email || "",
        );

        if (controller.signal.aborted) return;

        const stale_non_received = fetched
          .filter((email) => email.item_type !== "received")
          .map((email) => email.id);

        if (stale_non_received.length > 0) {
          remove_ids(stale_non_received);
        }

        const received_only = fetched
          .filter((email) => email.item_type === "received")
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

        set_state((prev) => build_list_state(prev, grouped, total, has_more));
      } catch {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
          has_initial_load: true,
        }));
      }
    },
    [
      enabled,
      active_category,
      format_options,
      user?.email,
      preferences.conversation_grouping,
    ],
  );

  useEffect(() => {
    if (!enabled) return;

    const ids = get_page_ids(active_category, page, page_size);
    const signature = `${active_category}|${page}|${ids.join(",")}`;

    if (signature === last_signature_ref.current) return;

    last_signature_ref.current = signature;
    void fetch_page(page, page_size);
  }, [enabled, active_category, page, page_size, index_version, fetch_page]);

  useEffect(() => {
    if (!enabled) return;

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

        await fetch_page(page, page_size);
      })();
    };

    window.addEventListener(
      MAIL_EVENTS.REFRESH_REQUESTED,
      handle_refresh_requested,
    );

    return () =>
      window.removeEventListener(
        MAIL_EVENTS.REFRESH_REQUESTED,
        handle_refresh_requested,
      );
  }, [enabled, page, page_size, fetch_page]);

  const update_email = useCallback(
    (id: string, updates: Partial<InboxEmail>): void => {
      for (const key of page_cache.current.keys()) {
        const ids_part = key.split(":").slice(2).join(":");

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

  const fetch_page_ref = useRef<
    ((page: number, limit: number, force?: boolean) => Promise<void>) | null
  >(null);

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

  const bulk_delete = useCallback(
    async (ids: string[]): Promise<void> => {
      remove_ids(ids);
      await raw_bulk.bulk_delete(ids);
    },
    [raw_bulk],
  );

  const bulk_archive = useCallback(
    async (ids: string[]): Promise<void> => {
      remove_ids(ids);
      await raw_bulk.bulk_archive(ids);
    },
    [raw_bulk],
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
    delete_email,
    archive_email,
    unarchive_email,
    mark_spam,
    bulk_delete,
    bulk_archive,
    bulk_unarchive: raw_bulk.bulk_unarchive,
    refresh,
  };
}
