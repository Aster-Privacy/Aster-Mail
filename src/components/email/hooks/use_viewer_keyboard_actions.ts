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
import { useEffect, useRef } from "react";

import { toggle_viewer_star } from "@/components/email/hooks/toggle_viewer_star";
import { use_i18n } from "@/lib/i18n";

interface KeyboardViewer {
  is_read: boolean;
  email: { is_starred?: boolean } | null;
  handle_archive: () => unknown;
  handle_trash: () => unknown;
  handle_spam: () => void | Promise<void>;
  handle_read_toggle: () => unknown;
}

export const UNLISTED_KEYBOARD_ACTION_EVENT = "astermail:keyboard-unlisted";

interface UseViewerKeyboardActionsOptions {
  enabled: boolean;
  handles_unlisted?: boolean;
  email_id: string;
  viewer: KeyboardViewer;
  request_spam: (perform: () => void | Promise<void>) => void;
  on_snooze?: () => void;
}

export function use_viewer_keyboard_actions({
  enabled,
  handles_unlisted = false,
  email_id,
  viewer,
  request_spam,
  on_snooze,
}: UseViewerKeyboardActionsOptions): void {
  const { t } = use_i18n();
  const keyboard_actions_ref = useRef({ viewer, request_spam, on_snooze, t });

  keyboard_actions_ref.current = { viewer, request_spam, on_snooze, t };

  useEffect(() => {
    if (!handles_unlisted || enabled) return;
    const handle_unlisted = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; action: string }>).detail;

      if (!detail || detail.id !== email_id) return;
      const current = keyboard_actions_ref.current.viewer;

      if (detail.action === "archive") void current.handle_archive();
      else if (detail.action === "delete") void current.handle_trash();
      else if (detail.action === "spam")
        keyboard_actions_ref.current.request_spam(current.handle_spam);
      else if (detail.action === "mark-read" && !current.is_read)
        void current.handle_read_toggle();
      else if (detail.action === "mark-unread" && current.is_read)
        void current.handle_read_toggle();
      else if (detail.action === "star" && current.email)
        void toggle_viewer_star(
          email_id,
          !!current.email.is_starred,
          keyboard_actions_ref.current.t,
        );
      else if (detail.action === "snooze")
        keyboard_actions_ref.current.on_snooze?.();
    };

    window.addEventListener(UNLISTED_KEYBOARD_ACTION_EVENT, handle_unlisted);

    return () =>
      window.removeEventListener(
        UNLISTED_KEYBOARD_ACTION_EVENT,
        handle_unlisted,
      );
  }, [handles_unlisted, enabled, email_id]);

  useEffect(() => {
    if (!enabled) return;
    const owns = (e: Event) =>
      (e as CustomEvent<{ id: string }>).detail?.id === email_id;
    const handlers: Record<string, (e: Event) => void> = {
      "astermail:keyboard-archive": (e) => {
        if (!owns(e)) return;
        e.stopImmediatePropagation();
        void keyboard_actions_ref.current.viewer.handle_archive();
      },
      "astermail:keyboard-delete": (e) => {
        if (!owns(e)) return;
        e.stopImmediatePropagation();
        void keyboard_actions_ref.current.viewer.handle_trash();
      },
      "astermail:keyboard-spam": (e) => {
        if (!owns(e)) return;
        e.stopImmediatePropagation();
        const { viewer: current, request_spam: request } =
          keyboard_actions_ref.current;

        request(current.handle_spam);
      },
      "astermail:keyboard-mark-read": (e) => {
        if (!owns(e)) return;
        e.stopImmediatePropagation();
        const current = keyboard_actions_ref.current.viewer;

        if (!current.is_read) void current.handle_read_toggle();
      },
      "astermail:keyboard-mark-unread": (e) => {
        if (!owns(e)) return;
        e.stopImmediatePropagation();
        const current = keyboard_actions_ref.current.viewer;

        if (current.is_read) void current.handle_read_toggle();
      },
      "astermail:keyboard-star": (e) => {
        if (!owns(e)) return;
        const current = keyboard_actions_ref.current.viewer.email;

        if (!current) return;
        e.stopImmediatePropagation();
        void toggle_viewer_star(
          email_id,
          !!current.is_starred,
          keyboard_actions_ref.current.t,
        );
      },
      "astermail:keyboard-snooze": (e) => {
        if (!owns(e)) return;
        const open_snooze = keyboard_actions_ref.current.on_snooze;

        if (!open_snooze) return;
        e.stopImmediatePropagation();
        open_snooze();
      },
    };

    for (const [name, handler] of Object.entries(handlers)) {
      window.addEventListener(name, handler, true);
    }

    return () => {
      for (const [name, handler] of Object.entries(handlers)) {
        window.removeEventListener(name, handler, true);
      }
    };
  }, [enabled, email_id]);
}
