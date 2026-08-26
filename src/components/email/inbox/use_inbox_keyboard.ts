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
import type { InboxEmail } from "@/types/email";

import { useEffect } from "react";

import { is_popup_email_open } from "@/components/email/hooks/popup_email_registry";

interface ContextMenuActions {
  handle_archive: (email: InboxEmail) => void;
  handle_delete: (email: InboxEmail) => void;
  handle_spam: (email: InboxEmail) => void;
  handle_toggle_read: (email: InboxEmail) => void;
  handle_toggle_star: (email: InboxEmail) => Promise<void> | void;
}

interface ExtraKeyboardActions {
  handle_open_snooze?: (email: InboxEmail) => void;
  handle_select?: (id: string) => void;
  handle_select_all?: () => void;
}

export function use_inbox_keyboard(
  emails: InboxEmail[],
  context_menu_actions: ContextMenuActions,
  extra_actions: ExtraKeyboardActions = {},
) {
  useEffect(() => {
    const find_email = (id: string) => emails.find((e) => e.id === id);
    const find_unowned_email = (id: string) =>
      is_popup_email_open(id) ? undefined : find_email(id);
    const handle_archive = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_unowned_email(detail.id);

      if (email) context_menu_actions.handle_archive(email);
    };
    const handle_delete = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_unowned_email(detail.id);

      if (email) context_menu_actions.handle_delete(email);
    };
    const handle_spam = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_unowned_email(detail.id);

      if (email) context_menu_actions.handle_spam(email);
    };
    const handle_mark_read = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_unowned_email(detail.id);

      if (email && !email.is_read)
        context_menu_actions.handle_toggle_read(email);
    };
    const handle_mark_unread = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_unowned_email(detail.id);

      if (email && email.is_read && email.item_type !== "sent")
        context_menu_actions.handle_toggle_read(email);
    };
    const handle_star = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_email(detail.id);

      if (email) void context_menu_actions.handle_toggle_star(email);
    };
    const handle_snooze = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_email(detail.id);

      if (email) extra_actions.handle_open_snooze?.(email);
    };
    const handle_select = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      extra_actions.handle_select?.(detail.id);
    };
    const handle_select_all = () => {
      extra_actions.handle_select_all?.();
    };

    window.addEventListener("astermail:keyboard-archive", handle_archive);
    window.addEventListener("astermail:keyboard-delete", handle_delete);
    window.addEventListener("astermail:keyboard-spam", handle_spam);
    window.addEventListener("astermail:keyboard-mark-read", handle_mark_read);
    window.addEventListener(
      "astermail:keyboard-mark-unread",
      handle_mark_unread,
    );
    window.addEventListener("astermail:keyboard-star", handle_star);
    window.addEventListener("astermail:keyboard-snooze", handle_snooze);
    window.addEventListener("astermail:keyboard-select", handle_select);
    window.addEventListener("astermail:keyboard-select-all", handle_select_all);

    return () => {
      window.removeEventListener("astermail:keyboard-archive", handle_archive);
      window.removeEventListener("astermail:keyboard-delete", handle_delete);
      window.removeEventListener("astermail:keyboard-spam", handle_spam);
      window.removeEventListener(
        "astermail:keyboard-mark-read",
        handle_mark_read,
      );
      window.removeEventListener(
        "astermail:keyboard-mark-unread",
        handle_mark_unread,
      );
      window.removeEventListener("astermail:keyboard-star", handle_star);
      window.removeEventListener("astermail:keyboard-snooze", handle_snooze);
      window.removeEventListener("astermail:keyboard-select", handle_select);
      window.removeEventListener(
        "astermail:keyboard-select-all",
        handle_select_all,
      );
    };
  }, [emails, context_menu_actions, extra_actions]);
}
