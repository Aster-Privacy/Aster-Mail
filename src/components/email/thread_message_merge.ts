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

import {
  PGP_UNDECRYPTABLE_SENTINEL,
  RATCHET_UNDECRYPTABLE_SENTINEL,
  is_ratchet_envelope,
} from "@/utils/email_crypto";
import { compare_timestamps_asc } from "@/utils/email_timestamp";

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

    return {
      ...message,
      body: earlier.body,
      html_content: earlier.html_content,
    };
  });

  return changed ? merged : incoming;
}

export function include_opened_message(
  messages: DecryptedThreadMessage[],
  opened: DecryptedThreadMessage,
): DecryptedThreadMessage[] {
  if (messages.length === 0) return [opened];

  const index = messages.findIndex((m) => m.id === opened.id);

  if (index === -1) {
    return [...messages, opened].sort((a, b) =>
      compare_timestamps_asc(a.timestamp, b.timestamp),
    );
  }

  const existing = messages[index];

  if (has_readable_body(existing) || !has_readable_body(opened)) {
    return messages;
  }

  const next = [...messages];

  next[index] = {
    ...existing,
    body: opened.body,
    html_content: opened.html_content,
  };

  return next;
}
