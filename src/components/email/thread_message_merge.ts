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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { ThreadContentField } from "@/services/thread_content_fields";

import {
  PGP_UNDECRYPTABLE_SENTINEL,
  RATCHET_UNDECRYPTABLE_SENTINEL,
  is_ratchet_envelope,
} from "@/utils/email_crypto";
import { compare_timestamps_asc } from "@/utils/email_timestamp";
import { THREAD_CONTENT_FIELDS } from "@/services/thread_content_fields";

type BodyFields = Pick<DecryptedThreadMessage, "body" | "html_content">;

export function has_readable_body(message: BodyFields): boolean {
  const content = message.html_content || message.body;

  if (!content || !content.trim()) return false;
  if (
    content === RATCHET_UNDECRYPTABLE_SENTINEL ||
    content === PGP_UNDECRYPTABLE_SENTINEL
  ) {
    return false;
  }

  return !is_ratchet_envelope(content);
}

function with_body_from(
  target: DecryptedThreadMessage,
  source: DecryptedThreadMessage,
): DecryptedThreadMessage {
  const content = Object.fromEntries(
    THREAD_CONTENT_FIELDS.map((field) => [field, source[field]]),
  ) as Pick<DecryptedThreadMessage, ThreadContentField>;

  return {
    ...target,
    ...content,
    timestamp: source.timestamp,
    has_recipient_key: source.has_recipient_key,
  };
}

function in_thread_order(
  messages: DecryptedThreadMessage[],
): DecryptedThreadMessage[] {
  return [...messages].sort((a, b) =>
    compare_timestamps_asc(a.timestamp, b.timestamp),
  );
}

export function keep_readable_bodies(
  previous: DecryptedThreadMessage[],
  incoming: DecryptedThreadMessage[],
): DecryptedThreadMessage[] {
  if (previous.length === 0) return incoming;

  const previous_by_id = new Map(previous.map((m) => [m.id, m]));
  let changed = false;

  const merged = incoming.map((message) => {
    const earlier = previous_by_id.get(message.id);

    if (!earlier || has_readable_body(message) || !has_readable_body(earlier)) {
      return message;
    }

    changed = true;

    return with_body_from(message, earlier);
  });

  return changed ? in_thread_order(merged) : incoming;
}

export function carry_local_reply_bodies(
  local_replies: DecryptedThreadMessage[],
  server: DecryptedThreadMessage[],
  previous_ids: Set<string>,
): DecryptedThreadMessage[] {
  const replies = [...local_replies].sort((a, b) =>
    compare_timestamps_asc(a.timestamp, b.timestamp),
  );
  const arrivals = server
    .filter((m) => m.item_type === "sent" && !previous_ids.has(m.id))
    .sort((a, b) => compare_timestamps_asc(a.timestamp, b.timestamp));
  const fills = new Map<string, DecryptedThreadMessage>();

  arrivals.slice(0, replies.length).forEach((arrival, index) => {
    const reply = replies[index];

    if (!has_readable_body(arrival) && has_readable_body(reply)) {
      fills.set(arrival.id, reply);
    }
  });

  if (fills.size === 0) return server;

  return server.map((message) => {
    const reply = fills.get(message.id);

    if (!reply) return message;

    return {
      ...message,
      body: reply.body,
      html_content: reply.html_content,
      text_part: reply.text_part,
    };
  });
}

export function include_opened_message(
  messages: DecryptedThreadMessage[],
  opened: DecryptedThreadMessage,
): DecryptedThreadMessage[] {
  if (messages.length === 0) return [opened];

  const index = messages.findIndex((m) => m.id === opened.id);

  if (index === -1) {
    return in_thread_order([...messages, opened]);
  }

  const existing = messages[index];

  if (has_readable_body(existing) || !has_readable_body(opened)) {
    return messages;
  }

  const next = [...messages];

  next[index] = with_body_from(existing, opened);

  return in_thread_order(next);
}

function same_value(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;

    return left.every((value, index) => same_value(value, right[index]));
  }

  if (
    Object.getPrototypeOf(left) !== Object.prototype ||
    Object.getPrototypeOf(right) !== Object.prototype
  ) {
    return false;
  }

  const left_record = left as Record<string, unknown>;
  const right_record = right as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(left_record),
    ...Object.keys(right_record),
  ]);

  for (const key of keys) {
    if (!same_value(left_record[key], right_record[key])) return false;
  }

  return true;
}

export function keep_unchanged_messages(
  previous: DecryptedThreadMessage[],
  incoming: DecryptedThreadMessage[],
): DecryptedThreadMessage[] {
  if (previous.length === 0) return incoming;

  const previous_by_id = new Map(previous.map((m) => [m.id, m]));
  const merged = incoming.map((message) => {
    const earlier = previous_by_id.get(message.id);

    return earlier && same_value(earlier, message) ? earlier : message;
  });
  const unchanged =
    merged.length === previous.length &&
    merged.every((message, index) => message === previous[index]);

  return unchanged ? previous : merged;
}
