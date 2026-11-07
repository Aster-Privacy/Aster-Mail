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
  get_cached_iframe_height,
  set_cached_iframe_height,
} from "@/components/email/sandboxed_email_renderer/helpers";

export interface MessageKeyState {
  messages: DecryptedThreadMessage[];
  keys: Map<string, string>;
}

export interface MessageKeyResult extends MessageKeyState {
  adopted: Array<{ from_id: string; to_id: string }>;
}

function is_local_reply(message: DecryptedThreadMessage): boolean {
  return (
    message.item_type === "sent" &&
    (message.is_sending === true || message.send_status === "pending_server")
  );
}

function by_time(a: DecryptedThreadMessage, b: DecryptedThreadMessage) {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}

export function assign_message_keys(
  previous: MessageKeyState,
  messages: DecryptedThreadMessage[],
): MessageKeyResult {
  const next_ids = new Set(messages.map((message) => message.id));
  const previous_ids = new Set(previous.messages.map((message) => message.id));
  const replaced = previous.messages
    .filter((message) => is_local_reply(message) && !next_ids.has(message.id))
    .sort(by_time);
  const arrivals = messages
    .filter(
      (message) =>
        message.item_type === "sent" &&
        !is_local_reply(message) &&
        !previous_ids.has(message.id),
    )
    .sort(by_time);
  const adopted: MessageKeyResult["adopted"] = [];
  const adopted_keys = new Map<string, string>();

  for (let i = 0; i < Math.min(replaced.length, arrivals.length); i++) {
    const from_id = replaced[i].id;
    const to_id = arrivals[i].id;

    adopted.push({ from_id, to_id });
    adopted_keys.set(to_id, previous.keys.get(from_id) ?? from_id);
  }

  const keys = new Map<string, string>();

  for (const message of messages) {
    keys.set(
      message.id,
      adopted_keys.get(message.id) ??
        previous.keys.get(message.id) ??
        message.id,
    );
  }

  return { messages, keys, adopted };
}

export function advance_message_keys(
  previous: MessageKeyState,
  messages: DecryptedThreadMessage[],
): MessageKeyState {
  if (previous.messages === messages) return previous;

  const result = assign_message_keys(previous, messages);

  result.adopted.forEach(({ from_id, to_id }) => {
    const height = get_cached_iframe_height(from_id);

    if (height && get_cached_iframe_height(to_id) === undefined) {
      set_cached_iframe_height(to_id, height);
    }
  });

  return { messages: result.messages, keys: result.keys };
}
