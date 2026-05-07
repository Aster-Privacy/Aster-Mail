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

import { useMemo, useCallback, useRef, useState } from "react";

import { use_email_selection } from "@/hooks/use_email_selection";
import { use_shift_key_ref } from "@/lib/use_shift_range_select";

interface UseInboxSelectionOptions {
  is_drafts_view: boolean;
  is_scheduled_view: boolean;
  emails: InboxEmail[];
  pinned_emails: InboxEmail[];
  primary_emails: InboxEmail[];
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  update_draft: (id: string, updates: Partial<InboxEmail>) => void;
  update_scheduled: (id: string, updates: Partial<InboxEmail>) => void;
}

export function use_inbox_selection({
  is_drafts_view,
  is_scheduled_view,
  emails,
  pinned_emails,
  primary_emails,
  update_email,
  update_draft,
  update_scheduled,
}: UseInboxSelectionOptions) {
  const { toggle_select, get_selected_ids, get_selection_state } =
    use_email_selection();

  const page_emails = useMemo(
    () => [...pinned_emails, ...primary_emails],
    [pinned_emails, primary_emails],
  );
  const { all_selected, some_selected, selected_count } =
    get_selection_state(page_emails);

  const get_update_fn = useCallback(() => {
    if (is_drafts_view)
      return update_draft as (id: string, updates: Partial<InboxEmail>) => void;
    if (is_scheduled_view)
      return update_scheduled as (
        id: string,
        updates: Partial<InboxEmail>,
      ) => void;

    return update_email;
  }, [
    is_drafts_view,
    is_scheduled_view,
    update_draft,
    update_scheduled,
    update_email,
  ]);

  const shift_ref = use_shift_key_ref();
  const shift_anchor_ref = useRef<string | null>(null);
  const last_shift_target_ref = useRef<string | null>(null);

  const [select_all_mode, set_select_all_mode] = useState(false);
  const activate_select_all_mode = useCallback(() => {
    set_select_all_mode(true);
  }, []);
  const exit_select_all_mode = useCallback(() => {
    set_select_all_mode(false);
  }, []);

  const handle_toggle_select = useCallback(
    (id: string): void => {
      const shift = shift_ref.current;
      const update_fn = get_update_fn();

      set_select_all_mode(false);

      if (shift && shift_anchor_ref.current !== null) {
        const anchor_index = page_emails.findIndex(
          (e) => e.id === shift_anchor_ref.current,
        );
        const current_index = page_emails.findIndex((e) => e.id === id);

        if (anchor_index !== -1 && current_index !== -1) {
          const anchor = page_emails[anchor_index];
          const should_select = anchor?.is_selected ?? true;
          const new_start = Math.min(anchor_index, current_index);
          const new_end = Math.max(anchor_index, current_index);

          const prev_target_id = last_shift_target_ref.current;

          if (prev_target_id !== null) {
            const prev_index = page_emails.findIndex(
              (e) => e.id === prev_target_id,
            );

            if (prev_index !== -1) {
              const old_start = Math.min(anchor_index, prev_index);
              const old_end = Math.max(anchor_index, prev_index);

              for (let i = old_start; i <= old_end; i++) {
                if (i < new_start || i > new_end) {
                  const target = page_emails[i];

                  if (target && target.is_selected === should_select) {
                    update_fn(target.id, { is_selected: !should_select });
                  }
                }
              }
            }
          }

          for (let i = new_start; i <= new_end; i++) {
            const target = page_emails[i];

            if (target && target.is_selected !== should_select) {
              update_fn(target.id, { is_selected: should_select });
            }
          }

          last_shift_target_ref.current = id;

          return;
        }
      }

      toggle_select(id, emails, update_fn);
      shift_anchor_ref.current = id;
      last_shift_target_ref.current = null;
    },
    [toggle_select, emails, get_update_fn, page_emails, shift_ref],
  );

  const handle_toggle_select_all = useCallback((): void => {
    const page_id_set = new Set(page_emails.map((e) => e.id));
    const all_page_selected = page_emails.every((e) => e.is_selected);
    const update_fn = get_update_fn();

    set_select_all_mode(false);

    emails.forEach((e) => {
      if (page_id_set.has(e.id)) {
        update_fn(e.id, { is_selected: !all_page_selected });
      }
    });
  }, [page_emails, emails, get_update_fn]);

  const handle_clear_selection = useCallback((): void => {
    const update_fn = get_update_fn();

    set_select_all_mode(false);

    emails.forEach((e) => {
      if (e.is_selected) {
        update_fn(e.id, { is_selected: false });
      }
    });
  }, [emails, get_update_fn]);

  const handle_select_by_filter = useCallback(
    (
      mode: "all" | "none" | "read" | "unread" | "starred" | "unstarred",
    ): void => {
      const update_fn = get_update_fn();
      const page_id_set = new Set(page_emails.map((e) => e.id));

      const match = (e: InboxEmail): boolean => {
        switch (mode) {
          case "all":
            return true;
          case "none":
            return false;
          case "read":
            return e.is_read === true;
          case "unread":
            return e.is_read === false;
          case "starred":
            return e.is_starred === true;
          case "unstarred":
            return e.is_starred !== true;
        }
      };

      emails.forEach((e) => {
        if (!page_id_set.has(e.id)) return;
        const should_select = match(e);

        if (e.is_selected !== should_select) {
          update_fn(e.id, { is_selected: should_select });
        }
      });
    },
    [page_emails, emails, get_update_fn],
  );

  const get_folder_status_for_selection = useCallback(
    (folder_token: string): "all" | "some" | "none" => {
      const selected_emails = emails.filter((e) => e.is_selected);

      if (selected_emails.length === 0) return "none";
      const in_folder_count = selected_emails.filter((e) =>
        e.folders?.some((f) => f.folder_token === folder_token),
      ).length;

      if (in_folder_count === 0) return "none";
      if (in_folder_count === selected_emails.length) return "all";

      return "some";
    },
    [emails],
  );

  const get_tag_status_for_selection = useCallback(
    (tag_token: string): "all" | "some" | "none" => {
      const selected_emails = emails.filter((e) => e.is_selected);

      if (selected_emails.length === 0) return "none";
      const with_tag_count = selected_emails.filter((e) =>
        e.tags?.some((t) => t.id === tag_token),
      ).length;

      if (with_tag_count === 0) return "none";
      if (with_tag_count === selected_emails.length) return "all";

      return "some";
    },
    [emails],
  );

  return {
    get_selected_ids,
    all_selected,
    some_selected,
    selected_count,
    handle_toggle_select,
    handle_toggle_select_all,
    handle_clear_selection,
    handle_select_by_filter,
    get_folder_status_for_selection,
    get_tag_status_for_selection,
    select_all_mode,
    activate_select_all_mode,
    exit_select_all_mode,
  };
}
