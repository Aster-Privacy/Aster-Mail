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

async function resolve_newest_sent_id(): Promise<string | undefined> {
  try {
    const response = await list_mail_items({
      item_type: "sent",
      is_trashed: false,
      is_spam: false,
      limit: 1,
      order: "desc",
      skip_total: true,
    });

    return response.data?.items[0]?.id;
  } catch (caught) {
    ignore_error(
      "components/toast/email_sent_toast:resolve_newest_sent_id",
      caught,
    );

    return undefined;
  }
}

export async function open_sent_message(email_id?: string): Promise<void> {
  const target = email_id ?? (await resolve_newest_sent_id());

  if (target) {
    open_message_in_view_mode(target);

    return;
  }

  open_sent_folder();
}

export function show_email_sent_toast(message: string, sent_id?: string): void {
  show_action_toast({
    message,
    action_type: "read",
    email_ids: [],
    duration_ms: 5000,
    on_view_message: () => {
      void open_sent_message(sent_id);
    },
  });
}
