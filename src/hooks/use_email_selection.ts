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

import { useCallback } from "react";

interface UseEmailSelectionReturn {
  toggle_select: (
    id: string,
    emails: InboxEmail[],
    update_fn: (id: string, updates: Partial<InboxEmail>) => void,
  ) => void;
  toggle_select_all: (
    filtered_emails: InboxEmail[],
    all_emails: InboxEmail[],
    set_emails: (emails: InboxEmail[]) => void,
  ) => void;
  get_selected_ids: (emails: InboxEmail[]) => string[];
  get_selection_state: (filtered_emails: InboxEmail[]) => {
    selected_count: number;
    all_selected: boolean;
    some_selected: boolean;
  };
}

export function use_email_selection(): UseEmailSelectionReturn {
  const toggle_select = useCallback(
    (
      id: string,
      emails: InboxEmail[],
      update_fn: (id: string, updates: Partial<InboxEmail>) => void,
    ): void => {
      const email = emails.find((e) => e.id === id);

      if (email) {
        update_fn(id, { is_selected: !email.is_selected });
      }
    },
    [],
  );

  const toggle_select_all = useCallback(
    (
      filtered_emails: InboxEmail[],
      all_emails: InboxEmail[],
      set_emails: (emails: InboxEmail[]) => void,
    ): void => {
      const visible_ids = new Set(filtered_emails.map((e) => e.id));
      const all_visible_selected = filtered_emails.every((e) => e.is_selected);

      const updated = all_emails.map((e) =>
        visible_ids.has(e.id)
          ? { ...e, is_selected: !all_visible_selected }
          : e,
      );

      set_emails(updated);
    },
    [],
  );

  const get_selected_ids = useCallback((emails: InboxEmail[]): string[] => {
    return emails.filter((e) => e.is_selected).map((e) => e.id);
  }, []);

  const get_selection_state = useCallback(
    (
      filtered_emails: InboxEmail[],
    ): {
      selected_count: number;
      all_selected: boolean;
      some_selected: boolean;
    } => {
      const selected_count = filtered_emails.filter(
        (e) => e.is_selected,
      ).length;
      const all_selected =
        filtered_emails.length > 0 && selected_count === filtered_emails.length;
      const some_selected =
        selected_count > 0 && selected_count < filtered_emails.length;

      return { selected_count, all_selected, some_selected };
    },
    [],
  );

  return {
    toggle_select,
    toggle_select_all,
    get_selected_ids,
    get_selection_state,
  };
}
