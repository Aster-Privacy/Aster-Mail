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
import type { ErrorTranslations } from "@/lib/i18n/types";
import type { DecryptedThreadMessage } from "@/types/thread";

export const max_reaction_recipients = 20;
export const max_reaction_emojis = 20;

export type ReactionRestriction =
  | "disabled"
  | "own_message"
  | "draft"
  | "spam_or_trash"
  | "reply_to"
  | "too_many_recipients"
  | "bcc"
  | "too_many_emojis"
  | "no_recipient";

export const reaction_restriction_keys: Record<
  ReactionRestriction,
  keyof ErrorTranslations
> = {
  disabled: "reactions_disabled",
  own_message: "cannot_react_own_message",
  draft: "cannot_react_draft",
  spam_or_trash: "cannot_react_spam_or_trash",
  reply_to: "cannot_react_reply_to",
  too_many_recipients: "cannot_react_too_many_recipients",
  bcc: "cannot_react_bcc",
  too_many_emojis: "cannot_react_too_many_emojis",
  no_recipient: "cannot_react_no_recipient",
};

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function header_value(
  message: DecryptedThreadMessage,
  name: string,
): string | undefined {
  return message.raw_headers?.find((h) => normalize(h.name) === name)?.value;
}

export function extract_addresses(value: string): string[] {
  return value
    .split(",")
    .map((part) => {
      const angled = part.match(/<([^>]+)>/);

      return normalize(angled ? angled[1] : part);
    })
    .filter((address) => address.includes("@"));
}

function has_distinct_reply_to(message: DecryptedThreadMessage): boolean {
  const reply_to = header_value(message, "reply-to");

  if (!reply_to) return false;

  const addresses = extract_addresses(reply_to);

  if (addresses.length === 0) return false;

  const sender = normalize(message.sender_email);

  return addresses.some((address) => address !== sender);
}

function unique_emoji_count(message: DecryptedThreadMessage): number {
  const emojis = new Set<string>();

  for (const reaction of message.reactions ?? []) {
    if (reaction.emoji) emojis.add(reaction.emoji);
  }

  return emojis.size;
}

function is_addressed_to(
  message: DecryptedThreadMessage,
  user_email: string,
  is_own_address?: (email: string) => boolean,
): boolean {
  const me = normalize(user_email);

  if (!me) return true;

  const visible = [
    ...(message.to_recipients ?? []),
    ...(message.cc_recipients ?? []),
  ];

  if (visible.length === 0) return true;

  return visible.some((recipient) => {
    const email = normalize(recipient.email);

    return email === me || is_own_address?.(email) === true;
  });
}

export function reaction_restriction(
  message: DecryptedThreadMessage,
  user_email: string,
  reactions_enabled: boolean,
  is_own_address?: (email: string) => boolean,
): ReactionRestriction | null {
  if (!reactions_enabled) return "disabled";
  if (message.item_type === "sent") return "own_message";
  if (message.item_type === "draft" || message.send_status === "scheduled") {
    return "draft";
  }
  if (message.is_spam === true || message.is_deleted === true) {
    return "spam_or_trash";
  }
  if (has_distinct_reply_to(message)) return "reply_to";

  const recipient_count =
    (message.to_recipients?.length ?? 0) + (message.cc_recipients?.length ?? 0);

  if (recipient_count > max_reaction_recipients) return "too_many_recipients";
  if (!is_addressed_to(message, user_email, is_own_address)) return "bcc";
  if (unique_emoji_count(message) >= max_reaction_emojis) {
    return "too_many_emojis";
  }
  if (!normalize(message.sender_email)) return "no_recipient";

  return null;
}
