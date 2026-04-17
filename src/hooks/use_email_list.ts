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
import type { InboxEmail, EmailListState } from "@/types/email";
import type { FormatOptions } from "@/utils/date_format";
import type { UseEmailListReturn } from "./email_list_types";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Capacitor } from "@capacitor/core";

import { fetch_mail_from_api, DEFAULT_PAGE_SIZE } from "./email_list_helpers";
import {
  view_cache,
  invalidate_mail_cache,
  clear_mail_cache,
  remove_email_from_view_cache,
  mark_view_stale,
} from "./email_list_cache";
import { MIN_SKELETON_MS } from "./email_list_types";
import { use_email_list_actions } from "./use_email_list_actions";
import { use_email_list_bulk } from "./use_email_list_bulk";
import { use_email_list_events } from "./use_email_list_events";

import { has_passphrase_in_memory } from "@/services/crypto/memory_key_store";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { clear_preload_cache } from "@/components/email/hooks/preload_cache";
import {
  cache_email_list,
  get_cached_email_list,
} from "@/services/offline_email_cache";
import { use_online_status } from "@/hooks/use_online_status";
import { request_cache } from "@/services/api/request_cache";

export type { UseEmailListReturn } from "./email_list_types";
export {
  invalidate_mail_cache,
  clear_mail_cache,
  remove_email_from_view_cache,
  mark_view_stale,
};

export function use_email_list(current_view: string): UseEmailListReturn {
  const {
    has_keys,
    is_loading: auth_loading,
    is_authenticated,
    user,
    is_completing_registration,
  } = use_auth();
  const { preferences } = use_preferences();
  const { is_online } = use_online_status();
  const [state, set_state] = useState<EmailListState>(() => {
    const cached = view_cache.get(current_view);

    if (
      cached &&
      cached.conversation_grouping ===
        (preferences.conversation_grouping ?? true)
    ) {
      return cached.state;
    }

    return {
      emails: [],
      is_loading: true,
      is_loading_more: false,
      total_messages: 0,
      has_more: false,
      has_initial_load: false,
    };
  });
  const [render_view, set_render_view] = useState(current_view);

  if (render_view !== current_view) {
    set_render_view(current_view);
    const cached = view_cache.get(current_view);

    if (
      cached &&
      cached.conversation_grouping ===
        (preferences.conversation_grouping ?? true)
    ) {
      set_state(cached.state);
    } else {
      set_state({
        emails: [],
        is_loading: true,
        is_loading_more: false,
        total_messages: 0,
        has_more: false,
        has_initial_load: false,
      });
    }
  }

  const [new_email_count, set_new_email_count] = useState(0);
  const abort_ref = useRef<AbortController | null>(null);
  const mounted_ref = useRef(false);
  const prev_auth_ref = useRef<{
    has_keys: boolean;
    is_authenticated: boolean;
  } | null>(null);
  const prev_view_ref = useRef<string | null>(null);
  const prev_user_id_ref = useRef<string | null>(null);
  const fetch_page_ref = useRef<
    ((page: number, limit: number, force?: boolean) => Promise<void>) | null
  >(null);
  const silent_fetch_ref = useRef<(() => Promise<void>) | null>(null);
  const last_fetch_ref = useRef<{
    view: string;
    page: number;
    time: number;
  } | null>(null);
  const page_ref = useRef(0);

  const is_mail_view = useMemo(() => current_view !== "drafts", [current_view]);

  const format_options: FormatOptions = useMemo(
    () => ({
      date_format: preferences.date_format as FormatOptions["date_format"],
      time_format: preferences.time_format,
    }),
    [preferences.date_format, preferences.time_format],
  );

  const fetch_page = useCallback(
    async (page: number, limit: number, force?: boolean): Promise<void> => {
      if (!is_mail_view) return;
      if (!has_passphrase_in_memory()) return;

      const now = Date.now();
      const last = last_fetch_ref.current;

      if (
        !force &&
        last &&
        last.view === current_view &&
        last.page === page &&
        now - last.time < 2000
      ) {
        return;
      }

      abort_ref.current?.abort();
      abort_ref.current = new AbortController();
      const { signal } = abort_ref.current;
      const start = Date.now();

      set_state((prev) => ({ ...prev, is_loading: true }));

      try {
        const offset = page * limit;
        const result = await fetch_mail_from_api(
          current_view,
          signal,
          format_options,
          user?.email || "",
          limit,
          undefined,
          offset,
          preferences.conversation_grouping ?? true,
        );

        if (signal.aborted) return;

        if (!result) {
          set_state((prev) => ({ ...prev, is_loading: false }));

          return;
        }

        const elapsed = Date.now() - start;

        if (elapsed < MIN_SKELETON_MS) {
          await new Promise((r) => setTimeout(r, MIN_SKELETON_MS - elapsed));
        }

        if (signal.aborted) return;

        last_fetch_ref.current = { view: current_view, page, time: now };
        page_ref.current = page;
        state_view_ref.current = current_view;

        set_state((prev) => {
          const selected_ids = new Set(
            prev.emails.filter((e) => e.is_selected).map((e) => e.id),
          );
          const emails =
            selected_ids.size > 0
              ? result.emails.map((e) =>
                  selected_ids.has(e.id) ? { ...e, is_selected: true } : e,
                )
              : result.emails;

          return {
            emails,
            is_loading: false,
            is_loading_more: false,
            total_messages: result.total,
            has_more: result.has_more,
            has_initial_load: true,
          };
        });
        set_new_email_count(0);

        if (Capacitor.isNativePlatform() && result.emails.length > 0) {
          cache_email_list(current_view, result.emails).catch(() => {});
        }
      } catch {
        if (!signal.aborted) {
          set_state((prev) => ({ ...prev, is_loading: false }));
        }
      }
    },
    [
      current_view,
      is_mail_view,
      format_options,
      user?.email,
      preferences.conversation_grouping,
    ],
  );

  fetch_page_ref.current = fetch_page;

  const silent_fetch = useCallback(async (): Promise<void> => {
    if (!is_mail_view) return;
    if (!has_passphrase_in_memory()) return;

    const controller = new AbortController();
    const { signal } = controller;

    try {
      const result = await fetch_mail_from_api(
        current_view,
        signal,
        format_options,
        user?.email || "",
        DEFAULT_PAGE_SIZE,
        undefined,
        0,
        preferences.conversation_grouping ?? true,
      );

      if (signal.aborted || !result) return;

      last_fetch_ref.current = {
        view: current_view,
        page: 0,
        time: Date.now(),
      };
      page_ref.current = 0;
      state_view_ref.current = current_view;

      set_state((prev) => {
        const selected_ids = new Set(
          prev.emails.filter((e) => e.is_selected).map((e) => e.id),
        );
        const emails =
          selected_ids.size > 0
            ? result.emails.map((e) =>
                selected_ids.has(e.id) ? { ...e, is_selected: true } : e,
              )
            : result.emails;

        return {
          emails,
          is_loading: false,
          is_loading_more: false,
          total_messages: result.total,
          has_more: result.has_more,
          has_initial_load: true,
        };
      });
      set_new_email_count(0);
    } catch {}
  }, [current_view, is_mail_view, format_options, user?.email]);

  silent_fetch_ref.current = silent_fetch;

  const load_more = useCallback(async (): Promise<void> => {
    if (!is_mail_view || !has_passphrase_in_memory()) return;
    if (!state.has_more || state.is_loading_more) return;

    const next_page = page_ref.current + 1;
    const offset = next_page * DEFAULT_PAGE_SIZE;

    set_state((prev) => ({ ...prev, is_loading_more: true }));

    const controller = new AbortController();

    try {
      const result = await fetch_mail_from_api(
        current_view,
        controller.signal,
        format_options,
        user?.email || "",
        DEFAULT_PAGE_SIZE,
        undefined,
        offset,
        preferences.conversation_grouping ?? true,
      );

      if (controller.signal.aborted) return;

      if (!result) {
        set_state((prev) => ({ ...prev, is_loading_more: false }));

        return;
      }

      page_ref.current = next_page;

      set_state((prev) => ({
        emails: [...prev.emails, ...result.emails],
        is_loading: false,
        is_loading_more: false,
        total_messages: result.total,
        has_more: result.has_more,
        has_initial_load: true,
      }));
    } catch {
      set_state((prev) => ({ ...prev, is_loading_more: false }));
    }
  }, [
    current_view,
    is_mail_view,
    format_options,
    user?.email,
    state.has_more,
    state.is_loading_more,
  ]);

  const refresh = useCallback(() => {
    last_fetch_ref.current = null;
    request_cache.invalidate("GET:/mail/v1/messages");
    set_state({
      emails: [],
      is_loading: true,
      is_loading_more: false,
      total_messages: 0,
      has_more: false,
      has_initial_load: false,
    });
    fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE);
  }, []);

  const prev_grouping_ref = useRef(preferences.conversation_grouping);

  useEffect(() => {
    if (prev_grouping_ref.current !== preferences.conversation_grouping) {
      prev_grouping_ref.current = preferences.conversation_grouping;
      invalidate_mail_cache();
      clear_preload_cache();
      refresh();
    }
  }, [preferences.conversation_grouping, refresh]);

  const load_new_emails = useCallback(() => {
    last_fetch_ref.current = null;
    request_cache.invalidate("GET:/mail/v1/messages");
    fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE);
  }, []);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  const state_view_ref = useRef<string>(current_view);

  useEffect(() => {
    if (
      state.emails.length > 0 &&
      !state.is_loading &&
      state_view_ref.current === current_view
    ) {
      view_cache.set(current_view, {
        state,
        time: Date.now(),
        is_stale: false,
        conversation_grouping: preferences.conversation_grouping ?? true,
      });
    }
  }, [state, current_view, preferences.conversation_grouping]);

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
      prev_user_id !== null &&
      current_user_id !== null &&
      prev_user_id !== current_user_id;

    prev_auth_ref.current = { has_keys, is_authenticated };
    prev_view_ref.current = current_view;
    if (current_user_id !== null) {
      prev_user_id_ref.current = current_user_id;
    }

    abort_ref.current?.abort();

    if (auth_changed || user_changed || view_changed) {
      last_fetch_ref.current = null;
      const cached = view_cache.get(current_view);

      if (
        view_changed &&
        !auth_changed &&
        !user_changed &&
        cached &&
        cached.conversation_grouping ===
          (preferences.conversation_grouping ?? true)
      ) {
        state_view_ref.current = current_view;
        set_state(cached.state);
        if (cached.is_stale || Date.now() - cached.time > 30_000) {
          silent_fetch_ref.current?.();
        }

        return () => abort_ref.current?.abort();
      }

      set_state({
        emails: [],
        is_loading: true,
        is_loading_more: false,
        total_messages: 0,
        has_more: false,
        has_initial_load: false,
      });
    }

    if (is_completing_registration) {
      return () => abort_ref.current?.abort();
    }

    const nothing_changed = !auth_changed && !view_changed && !user_changed;
    const already_has_data = state.emails.length > 0 && !state.is_loading;

    if (has_keys && has_passphrase_in_memory()) {
      if (!is_online && Capacitor.isNativePlatform()) {
        if (nothing_changed && already_has_data) {
          return () => abort_ref.current?.abort();
        }
        get_cached_email_list(current_view)
          .then((cached) => {
            if (cached && cached.length > 0) {
              set_state({
                emails: cached,
                is_loading: false,
                is_loading_more: false,
                total_messages: cached.length,
                has_more: false,
                has_initial_load: true,
              });
            } else {
              set_state({
                emails: [],
                is_loading: false,
                is_loading_more: false,
                total_messages: 0,
                has_more: false,
                has_initial_load: true,
              });
            }
          })
          .catch(() => {
            set_state({
              emails: [],
              is_loading: false,
              is_loading_more: false,
              total_messages: 0,
              has_more: false,
              has_initial_load: false,
            });
          });
      } else {
        if (nothing_changed && already_has_data) {
          return () => abort_ref.current?.abort();
        }
        fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE, true);
      }
    } else if (!is_online && Capacitor.isNativePlatform() && has_keys) {
      get_cached_email_list(current_view)
        .then((cached) => {
          if (cached && cached.length > 0) {
            set_state({
              emails: cached,
              is_loading: false,
              is_loading_more: false,
              total_messages: cached.length,
              has_more: false,
              has_initial_load: true,
            });
          } else {
            set_state({
              emails: [],
              is_loading: false,
              is_loading_more: false,
              total_messages: 0,
              has_more: false,
              has_initial_load: true,
            });
          }
        })
        .catch(() => {
          set_state({
            emails: [],
            is_loading: false,
            is_loading_more: false,
            total_messages: 0,
            has_more: false,
            has_initial_load: false,
          });
        });
    } else if (has_keys && !has_passphrase_in_memory()) {
      set_state((prev) =>
        prev.is_loading ? prev : { ...prev, is_loading: true },
      );
    } else if (is_authenticated && !has_keys) {
      set_state((prev) =>
        prev.is_loading ? prev : { ...prev, is_loading: true },
      );
    } else {
      set_state((prev) =>
        !prev.is_loading && prev.emails.length === 0
          ? prev
          : {
              emails: [],
              is_loading: false,
              is_loading_more: false,
              total_messages: 0,
              has_more: false,
              has_initial_load: false,
            },
      );
    }

    return () => abort_ref.current?.abort();
  }, [
    auth_loading,
    has_keys,
    is_authenticated,
    current_view,
    is_mail_view,
    user?.id,
    is_completing_registration,
    is_online,
  ]);

  useEffect(() => {
    if (!state.is_loading) return;
    const safety_timeout = setTimeout(() => {
      set_state((prev) =>
        prev.is_loading ? { ...prev, is_loading: false } : prev,
      );
    }, 10_000);

    return () => clearTimeout(safety_timeout);
  }, [state.is_loading]);

  const update_email = useCallback(
    (id: string, updates: Partial<InboxEmail>): void => {
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
    set_state((prev) => ({
      ...prev,
      emails: prev.emails.filter((e) => e.id !== id),
      total_messages: Math.max(0, prev.total_messages - 1),
    }));
  }, []);

  const remove_emails = useCallback((ids: string[]): void => {
    const id_set = new Set(ids);

    set_state((prev) => ({
      ...prev,
      emails: prev.emails.filter((e) => !id_set.has(e.id)),
      total_messages: Math.max(0, prev.total_messages - ids.length),
    }));
  }, []);

  use_email_list_events({
    current_view,
    is_mail_view,
    has_keys,
    auth_loading,
    is_completing_registration,
    set_state,
    set_new_email_count,
    fetch_page_ref,
    silent_fetch_ref,
    last_fetch_ref,
  });

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

  const { bulk_delete, bulk_archive, bulk_unarchive } = use_email_list_bulk({
    state,
    set_state,
    fetch_page_ref,
  });

  return {
    state,
    new_email_count,
    load_new_emails,
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
    bulk_unarchive,
    refresh,
  };
}
