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

import { useCallback, useMemo } from "react";

import { use_context_menu_actions } from "@/components/email/inbox/inbox_context_menu_handler";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";

export type SplitEmailViewParams = {
  split_email_id: string | null | undefined;
  email_state: { emails: InboxEmail[] };
  filtered_emails: InboxEmail[];
  handle_snooze: (
    email_id: string,
    snooze_until: Date,
  ) => Promise<boolean | void>;
  handle_unsnooze: (email_id: string) => Promise<void>;
  tags_state: ReturnType<typeof use_tags>["state"];
  folders_state: ReturnType<typeof use_folders>["state"];
  context_menu_actions: ReturnType<typeof use_context_menu_actions>;
};

export function use_split_email_view({
  split_email_id,
  email_state,
  filtered_emails,
  handle_snooze,
  handle_unsnooze,
  tags_state,
  folders_state,
  context_menu_actions,
}: SplitEmailViewParams) {
  const split_email_snoozed_until = useMemo(() => {
    if (!split_email_id) return undefined;

    return email_state.emails.find((e) => e.id === split_email_id)
      ?.snoozed_until;
  }, [split_email_id, email_state.emails]);
  const split_email_grouped_ids = useMemo(() => {
    if (!split_email_id) return undefined;

    return email_state.emails.find((e) => e.id === split_email_id)
      ?.grouped_email_ids;
  }, [split_email_id, email_state.emails]);
  const split_email_label_hints = useMemo(() => {
    if (!split_email_id) return undefined;
    const found =
      filtered_emails.find((e) => e.id === split_email_id) ??
      email_state.emails.find((e) => e.id === split_email_id);

    if (!found) return undefined;
    const hints: {
      token: string;
      name: string;
      color?: string;
      icon?: string;
      show_icon?: boolean;
    }[] = [];

    for (const f of found.folders ?? []) {
      if (f.name)
        hints.push({
          token: f.folder_token,
          name: f.name,
          color: f.color,
          icon: f.icon,
          show_icon: true,
        });
    }
    for (const tag of found.tags ?? []) {
      if (tag.name)
        hints.push({
          token: tag.id,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
          show_icon: true,
        });
    }

    return hints.length > 0 ? hints : undefined;
  }, [split_email_id, filtered_emails, email_state.emails]);
  const handle_list_snooze = useCallback(
    (email: InboxEmail, snooze_until: Date) =>
      handle_snooze(email.id, snooze_until),
    [handle_snooze],
  );
  const handle_list_unsnooze = useCallback(
    (email: InboxEmail) => handle_unsnooze(email.id),
    [handle_unsnooze],
  );
  const list_tags = useMemo(
    () =>
      tags_state.tags.map((tag) => ({
        tag_token: tag.tag_token,
        name: tag.name,
        color: tag.color || "#6366f1",
      })),
    [tags_state.tags],
  );
  const viewer_folders = useMemo(
    () =>
      folders_state.folders
        .filter((f) => !f.is_system)
        .map((f) => ({
          id: f.folder_token,
          name: f.name,
          color: f.color || "#6366f1",
        })),
    [folders_state.folders],
  );
  const handle_viewer_folder_toggle = useCallback(
    (folder_id: string) => {
      if (!split_email_id) return;
      const email = email_state.emails.find((e) => e.id === split_email_id);

      if (email) {
        context_menu_actions.handle_folder_toggle(email, folder_id);
      }
    },
    [split_email_id, email_state.emails, context_menu_actions],
  );

  return {
    split_email_snoozed_until,
    split_email_grouped_ids,
    split_email_label_hints,
    handle_list_snooze,
    handle_list_unsnooze,
    list_tags,
    viewer_folders,
    handle_viewer_folder_toggle,
  };
}
