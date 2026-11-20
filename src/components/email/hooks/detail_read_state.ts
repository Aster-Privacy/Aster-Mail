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
interface ReadStateItem {
  id: string;
  is_read: boolean;
}

export type ReadIntentLookup = (id: string) => boolean | undefined;

export function with_message_read<T extends ReadStateItem>(
  messages: T[],
  id: string,
  is_read: boolean,
): T[] {
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== id || message.is_read === is_read) return message;
    changed = true;

    return { ...message, is_read };
  });

  return changed ? next : messages;
}

export function with_read_intents<T extends ReadStateItem>(
  messages: T[],
  lookup: ReadIntentLookup,
): T[] {
  let changed = false;
  const next = messages.map((message) => {
    const intent = lookup(message.id);

    if (intent === undefined || intent === message.is_read) return message;
    changed = true;

    return { ...message, is_read: intent };
  });

  return changed ? next : messages;
}

export function with_item_read_intent<T extends ReadStateItem>(
  item: T | null,
  lookup: ReadIntentLookup,
): T | null {
  if (!item) return item;
  const intent = lookup(item.id);

  if (intent === undefined || intent === item.is_read) return item;

  return { ...item, is_read: intent };
}
