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

import type { DecryptedThreadMessage } from "@/types/thread";
import type { PrintThreadData } from "@/utils/print_email";

import { app_locale, get_display_time_zone } from "@/utils/date_format";

export function build_thread_print_data(
  subject: string,
  messages: DecryptedThreadMessage[],
): PrintThreadData | null {
  if (messages.length === 0) return null;

  return {
    subject,
    messages: messages.map((msg) => ({
      sender: msg.display_sender_name || msg.sender_name,
      sender_email: msg.display_sender_email || msg.sender_email,
      timestamp: new Date(msg.timestamp).toLocaleString(app_locale(), {
        timeZone: get_display_time_zone(),
      }),
      body: msg.html_content || msg.body,
      to_recipients: msg.to_recipients,
      cc_recipients: msg.cc_recipients,
      bcc_recipients: msg.bcc_recipients,
    })),
  };
}
