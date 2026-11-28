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
import { show_action_toast } from "@/components/toast/action_toast";
import {
  open_message_in_view_mode,
  open_sent_folder,
} from "@/components/toast/toast_action_router";
import { list_mail_items } from "@/services/api/mail";
import { ignore_error } from "@/lib/ignore_error";
import { get_active_translations } from "@/lib/i18n/translations";
import { play_send_settled_sound } from "@/services/iconic_sounds";

export function play_email_sent_sound(): void {
  play_send_settled_sound(false);
}

async function resolve_newest_sent_id(): Promise<string | undefined> {
  const response = await list_mail_items({
    item_type: "sent",
    is_trashed: false,
    is_spam: false,
    limit: 1,
    order: "desc",
    skip_total: true,
  }).catch((caught: unknown) => {
    ignore_error("components/toast/email_sent_toast", caught);
  });

  return response?.data?.items[0]?.id;
}

export async function open_sent_message(email_id?: string): Promise<void> {
  const target =
    email_id && !email_id.startsWith("temp_")
      ? email_id
      : await resolve_newest_sent_id();

  if (target) open_message_in_view_mode(target, "sent");
  else open_sent_folder();
}

export function show_email_sent_toast(
  message: string,
  undo_toast_shown = false,
  sent_id?: string,
): void {
  play_send_settled_sound(undo_toast_shown);
  show_action_toast({
    message,
    action_type: "read",
    sound: "none",
    email_ids: [],
    duration_ms: 5000,
    actions: [
      {
        label: get_active_translations().mail.view_message,
        on_press: () => {
          void open_sent_message(sent_id);
        },
      },
    ],
  });
}
