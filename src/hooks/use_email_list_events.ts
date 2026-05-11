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
import type { EmailListState } from "@/types/email";

import { useEffect, type MutableRefObject } from "react";

import {
  MAIL_EVENTS,
  type MailItemUpdatedEventDetail,
  type MailItemsRemovedEventDetail,
} from "./mail_events";
import { mark_view_stale } from "./email_list_cache";
import { DEFAULT_PAGE_SIZE } from "./email_list_helpers";

import { add_app_state_listener } from "@/native/capacitor_bridge";
import { has_passphrase_in_memory } from "@/services/crypto/memory_key_store";
import { request_cache } from "@/services/api/request_cache";
import {
  mark_preload_stale,
  delete_preloaded_email,
} from "@/components/email/hooks/preload_cache";

interface UseEmailListEventsParams {
  current_view: string;
  is_mail_view: boolean;
  has_keys: boolean;
  auth_loading: boolean;
  is_completing_registration: boolean;
  set_state: React.Dispatch<React.SetStateAction<EmailListState>>;
  fetch_page_ref: MutableRefObject<
    ((page: number, limit: number, force?: boolean) => Promise<void>) | null
  >;
  silent_fetch_ref: MutableRefObject<(() => Promise<void>) | null>;
  last_fetch_ref: MutableRefObject<{
    view: string;
    page: number;
    time: number;
  } | null>;
}

export function use_email_list_events({
  current_view,
  is_mail_view,
  has_keys,
  auth_loading,
  is_completing_registration,
  set_state,
  fetch_page_ref,
  silent_fetch_ref,
  last_fetch_ref,
}: UseEmailListEventsParams): void {
  useEffect(() => {
    if (
      auth_loading ||
      !is_mail_view ||
      !has_keys ||
      is_completing_registration
    )
      return;
    if (has_passphrase_in_memory()) return;

    let cleaned_up = false;

    const on_auth_ready = () => {
      if (cleaned_up) return;
      fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE);
    };

    window.addEventListener(MAIL_EVENTS.AUTH_READY, on_auth_ready);

    return () => {
      cleaned_up = true;
      window.removeEventListener(MAIL_EVENTS.AUTH_READY, on_auth_ready);
    };
  }, [
    auth_loading,
    has_keys,
    is_mail_view,
    is_completing_registration,
    fetch_page_ref,
  ]);

  useEffect(() => {
    if (!is_mail_view) return;

    let debounce_timer: ReturnType<typeof setTimeout> | null = null;

    const silent_handler = () => {
      if (has_keys && has_passphrase_in_memory()) {
        request_cache.invalidate("GET:/mail/v1/messages");
        mark_view_stale();
        if (debounce_timer) {
          clearTimeout(debounce_timer);
        }
        debounce_timer = setTimeout(() => {
          silent_fetch_ref.current?.();
        }, 150);
      }
    };

    const full_fetch_handler = () => {
      if (has_keys && has_passphrase_in_memory()) {
        request_cache.invalidate("GET:/mail/v1/messages");
        mark_view_stale();
        if (debounce_timer) {
          clearTimeout(debounce_timer);
        }
        debounce_timer = setTimeout(() => {
          fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE);
        }, 150);
      }
    };

    const handle_auth_ready = () => {
      fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE);
    };

    const handle_soft_refresh = () => {
      if (has_keys && has_passphrase_in_memory()) {
        if (debounce_timer) {
          clearTimeout(debounce_timer);
        }
        debounce_timer = setTimeout(() => {
          silent_fetch_ref.current?.();
        }, 150);
      }
    };

    const force_fetch_handler = () => {
      if (has_keys && has_passphrase_in_memory()) {
        request_cache.invalidate("GET:/mail/v1/messages");
        mark_view_stale();
        mark_preload_stale();
        if (debounce_timer) {
          clearTimeout(debounce_timer);
        }
        debounce_timer = setTimeout(() => {
          fetch_page_ref.current?.(0, DEFAULT_PAGE_SIZE, true);
        }, 150);
      }
    };

    const maybe_revalidate = () => {
      if (
        document.visibilityState !== "visible" ||
        !has_keys ||
        !has_passphrase_in_memory()
      ) {
        return;
      }
      const now = Date.now();
      const last = last_fetch_ref.current;

      if (last && now - last.time < 10_000) return;
      silent_fetch_ref.current?.();
    };

    const handle_visibility_change = () => {
      maybe_revalidate();
    };

    const handle_focus = () => {
      maybe_revalidate();
    };

    const poll_interval = window.setInterval(() => {
      maybe_revalidate();
    }, 60_000);

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, silent_handler);
    window.addEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, handle_soft_refresh);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, silent_handler);
    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, silent_handler);
    window.addEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);
    window.addEventListener(MAIL_EVENTS.FOLDERS_CHANGED, full_fetch_handler);
    window.addEventListener(
      MAIL_EVENTS.PROTECTED_FOLDERS_READY,
      full_fetch_handler,
    );
    window.addEventListener(MAIL_EVENTS.REFRESH_REQUESTED, force_fetch_handler);
    window.addEventListener("astermail:folder-locked", full_fetch_handler);
    document.addEventListener("visibilitychange", handle_visibility_change);
    window.addEventListener("focus", handle_focus);

    return () => {
      if (debounce_timer) {
        clearTimeout(debounce_timer);
      }
      window.clearInterval(poll_interval);
      window.removeEventListener("focus", handle_focus);
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, silent_handler);
      window.removeEventListener(
        MAIL_EVENTS.MAIL_SOFT_REFRESH,
        handle_soft_refresh,
      );
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, silent_handler);
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, silent_handler);
      window.removeEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);
      window.removeEventListener(
        MAIL_EVENTS.FOLDERS_CHANGED,
        full_fetch_handler,
      );
      window.removeEventListener(
        MAIL_EVENTS.PROTECTED_FOLDERS_READY,
        full_fetch_handler,
      );
      window.removeEventListener(
        MAIL_EVENTS.REFRESH_REQUESTED,
        force_fetch_handler,
      );
      window.removeEventListener("astermail:folder-locked", full_fetch_handler);
      document.removeEventListener(
        "visibilitychange",
        handle_visibility_change,
      );
    };
  }, [
    has_keys,
    is_mail_view,
    fetch_page_ref,
    silent_fetch_ref,
    last_fetch_ref,
  ]);

  useEffect(() => {
    if (!is_mail_view) return;

    const remove_listener = add_app_state_listener((is_active) => {
      if (is_active && has_keys && has_passphrase_in_memory()) {
        const now = Date.now();
        const last = last_fetch_ref.current;

        if (last && now - last.time < 5_000) return;
        setTimeout(() => {
          silent_fetch_ref.current?.();
        }, 300);
      }
    });

    return remove_listener;
  }, [has_keys, is_mail_view, silent_fetch_ref, last_fetch_ref]);

  useEffect(() => {
    const is_non_trash_spam_view =
      current_view !== "trash" && current_view !== "spam";

    const should_remove_from_view = (
      detail: MailItemUpdatedEventDetail,
    ): boolean => {
      if (is_non_trash_spam_view) {
        if (detail.is_trashed === true || detail.is_spam === true) {
          return true;
        }
      }

      if (
        current_view !== "archive" &&
        detail.is_archived === true
      ) {
        return true;
      }

      switch (current_view) {
        case "starred":
          return detail.is_starred === false;
        case "trash":
          return detail.is_trashed === false;
        case "archive":
          return detail.is_archived === false;
        case "spam":
          return detail.is_spam === false;
        default:
          if (
            current_view.startsWith("folder-") &&
            detail.folders !== undefined
          ) {
            const folder_token = current_view.replace("folder-", "");

            return !detail.folders.some((f) => f.folder_token === folder_token);
          }

          if (current_view.startsWith("tag-") && detail.tags !== undefined) {
            const tag_token = current_view.replace("tag-", "");

            return !detail.tags.some((t) => t.id === tag_token);
          }

          return false;
      }
    };

    const handle_item_update = (event: Event) => {
      const detail = (event as CustomEvent<MailItemUpdatedEventDetail>).detail;

      mark_preload_stale(detail.id);

      if (should_remove_from_view(detail)) {
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

    const handle_items_removed = (event: Event) => {
      const detail = (event as CustomEvent<MailItemsRemovedEventDetail>).detail;

      for (const id of detail.ids) {
        delete_preloaded_email(id);
      }

      const id_set = new Set(detail.ids);

      set_state((prev) => {
        const filtered = prev.emails.filter((e) => !id_set.has(e.id));
        const actually_removed = prev.emails.length - filtered.length;

        return {
          ...prev,
          emails: filtered,
          total_messages: Math.max(0, prev.total_messages - actually_removed),
        };
      });
    };

    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, handle_item_update);
    window.addEventListener(
      MAIL_EVENTS.MAIL_ITEMS_REMOVED,
      handle_items_removed,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEM_UPDATED,
        handle_item_update,
      );
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEMS_REMOVED,
        handle_items_removed,
      );
    };
  }, [current_view, set_state]);
}
