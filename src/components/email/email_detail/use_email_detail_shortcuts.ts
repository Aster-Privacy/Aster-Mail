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
import type { NavigateFunction } from "react-router-dom";

import { useCallback } from "react";

import { use_keyboard_shortcuts } from "@/hooks/use_keyboard_shortcuts";

export function leave_email_detail(
  navigate: NavigateFunction,
  is_popup: boolean,
): void {
  if (is_popup) {
    window.close();

    return;
  }

  const history_index = (window.history.state as { idx?: number } | null)
    ?.idx;

  if (typeof history_index === "number" && history_index > 0) {
    navigate(-1);
  } else {
    navigate("/");
  }
}

interface UseEmailDetailShortcutsOptions {
  enabled: boolean;
  has_email: boolean;
  is_any_modal_open: boolean;
  is_trashed: boolean;
  is_popup: boolean;
  confirm_before_archive: boolean;
  confirm_before_delete: boolean;
  navigate: NavigateFunction;
  handle_archive: () => unknown;
  handle_trash: () => unknown;
  set_is_archive_confirm_open: (open: boolean) => void;
  set_is_trash_confirm_open: (open: boolean) => void;
  on_compose: () => void;
}

export function use_email_detail_shortcuts({
  enabled,
  has_email,
  is_any_modal_open,
  is_trashed,
  is_popup,
  confirm_before_archive,
  confirm_before_delete,
  navigate,
  handle_archive,
  handle_trash,
  set_is_archive_confirm_open,
  set_is_trash_confirm_open,
  on_compose,
}: UseEmailDetailShortcutsOptions): void {
  const on_delete = useCallback(() => {
    if (confirm_before_delete && !is_trashed) {
      set_is_trash_confirm_open(true);

      return;
    }
    void handle_trash();
  }, [confirm_before_delete, is_trashed, set_is_trash_confirm_open, handle_trash]);

  const on_archive = useCallback(() => {
    if (confirm_before_archive) {
      set_is_archive_confirm_open(true);

      return;
    }
    void handle_archive();
  }, [confirm_before_archive, set_is_archive_confirm_open, handle_archive]);

  const on_close_viewer = useCallback(
    () => leave_email_detail(navigate, is_popup),
    [navigate, is_popup],
  );

  use_keyboard_shortcuts({
    enabled,
    is_any_modal_open,
    has_focused_email: has_email,
    has_viewed_email: has_email,
    handlers: {
      on_delete,
      on_archive,
      on_close_viewer,
      on_compose,
      on_reply: () =>
        window.dispatchEvent(new CustomEvent("astermail:keyboard-reply")),
      on_reply_all: () =>
        window.dispatchEvent(
          new CustomEvent("astermail:keyboard-reply", {
            detail: { reply_all: true },
          }),
        ),
      on_forward: () =>
        window.dispatchEvent(new CustomEvent("astermail:keyboard-forward")),
    },
  });
}
