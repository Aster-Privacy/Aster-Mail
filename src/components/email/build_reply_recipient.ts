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
import { extract_reply_to } from "@/utils/reply_to";

export interface ReplyRecipientSource {
  sender_name: string;
  sender_email: string;
  first_to?: { name: string; email: string };
  reply_to?: { name: string; email: string };
  reply_alias?: { name?: string; email: string };
  own_addresses?: string[];
}

export interface ReplyRecipient {
  recipient_name: string;
  recipient_email: string;
}

export function build_reply_recipient(
  source: ReplyRecipientSource,
  is_own_message: boolean,
): ReplyRecipient {
  const own_set = new Set(
    (source.own_addresses ?? [])
      .filter(Boolean)
      .map((addr) => addr.toLowerCase().trim()),
  );
  const is_own_address = (email: string): boolean =>
    own_set.has(email.toLowerCase().trim());

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

  if (source.reply_alias && source.reply_alias.email) {
    const a = source.reply_alias;

    return {
      recipient_name: a.name || get_email_username(a.email) || a.email,
      recipient_email: a.email,
    };
  }

  if (
    source.reply_to &&
    source.reply_to.email &&
    !is_own_address(source.reply_to.email)
  ) {
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

export interface ReplyRecipientMessage {
  item_type: string;
  sender_name: string;
  sender_email: string;
  display_sender_email?: string;
  to_recipients?: { name: string; email: string }[];
  raw_headers?: { name: string; value: string }[];
}

export function build_reply_recipient_for_message(
  message: ReplyRecipientMessage,
  own_addresses?: string[],
): ReplyRecipient {
  const is_own_message = message.item_type === "sent";
  const is_forwarded = !is_own_message && !!message.display_sender_email;
  const parsed_reply_to = extract_reply_to(message.raw_headers);

  return build_reply_recipient(
    {
      sender_name: message.sender_name,
      sender_email: message.sender_email,
      first_to: message.to_recipients?.[0],
      reply_to: parsed_reply_to
        ? { name: parsed_reply_to.name ?? "", email: parsed_reply_to.email }
        : undefined,
      reply_alias: is_forwarded
        ? { name: message.sender_name, email: message.sender_email }
        : undefined,
      own_addresses,
    },
    is_own_message,
  );
}
