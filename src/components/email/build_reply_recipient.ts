//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { get_email_username } from "@/lib/utils";

export interface ReplyRecipientSource {
  sender_name: string;
  sender_email: string;
  first_to?: { name: string; email: string };
  reply_to?: { name: string; email: string };
}

export interface ReplyRecipient {
  recipient_name: string;
  recipient_email: string;
}

export function build_reply_recipient(
  source: ReplyRecipientSource,
  is_own_message: boolean,
): ReplyRecipient {
  if (is_own_message) {
    if (source.first_to) {
      const t = source.first_to;

      return {
        recipient_name: t.name || get_email_username(t.email) || t.email,
        recipient_email: t.email,
      };
    }

    return {
      recipient_name: source.sender_name,
      recipient_email: source.sender_email,
    };
  }

  if (source.reply_to && source.reply_to.email) {
    const r = source.reply_to;

    return {
      recipient_name: r.name || get_email_username(r.email) || r.email,
      recipient_email: r.email,
    };
  }

  return {
    recipient_name: source.sender_name,
    recipient_email: source.sender_email,
  };
}
