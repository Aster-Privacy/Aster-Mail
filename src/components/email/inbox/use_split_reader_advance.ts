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
import type { ContextMenuActions } from "./inbox_context_menu_types";

import { useEffect, useMemo, useRef } from "react";

interface UseSplitReaderAdvanceOptions {
  context_menu_actions: ContextMenuActions;
  split_email_id?: string | null;
  emails: InboxEmail[];
  visible_ids: string[];
  is_confirm_open: boolean;
  on_auto_advance?: (remaining_ids?: string[]) => boolean;
  on_split_close?: () => void;
}

export function use_split_reader_advance({
  context_menu_actions,
  split_email_id,
  emails,
  visible_ids,
  is_confirm_open,
  on_auto_advance,
  on_split_close,
}: UseSplitReaderAdvanceOptions): ContextMenuActions {
  const leaving_id_ref = useRef<string | null>(null);
  const split_email_id_ref = useRef(split_email_id);

  split_email_id_ref.current = split_email_id;

  const actions = useMemo(() => {
    const watch =
      <R>(action: (email: InboxEmail) => R) =>
      (email: InboxEmail): R => {
        if (email.id === split_email_id_ref.current) {
          leaving_id_ref.current = email.id;
        }

        return action(email);
      };

    return {
      ...context_menu_actions,
      handle_archive: watch(context_menu_actions.handle_archive),
      handle_delete: watch(context_menu_actions.handle_delete),
      handle_spam: watch(context_menu_actions.handle_spam),
      handle_move_to_inbox: watch(context_menu_actions.handle_move_to_inbox),
      handle_mark_not_spam: watch(context_menu_actions.handle_mark_not_spam),
      handle_restore: watch(context_menu_actions.handle_restore),
    };
  }, [context_menu_actions]);

  useEffect(() => {
    const leaving_id = leaving_id_ref.current;

    if (!leaving_id) return;

    if (leaving_id !== split_email_id) {
      leaving_id_ref.current = null;

      return;
    }

    if (emails.some((email) => email.id === leaving_id)) {
      if (!is_confirm_open) leaving_id_ref.current = null;

      return;
    }

    leaving_id_ref.current = null;

    if (on_auto_advance?.(visible_ids)) return;

    on_split_close?.();
  }, [
    emails,
    visible_ids,
    split_email_id,
    is_confirm_open,
    on_auto_advance,
    on_split_close,
  ]);

  return actions;
}
