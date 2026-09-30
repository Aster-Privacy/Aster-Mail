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

export interface ReplyHeaderSource {
  id: string;
  raw_headers?: { name: string; value: string }[];
}

export const MAX_REPLY_REFERENCES_LENGTH = 512;

const MSG_ID_PATTERN = /<[^<>\s]+@[^<>\s]+>/g;

function header_value(
  headers: { name: string; value: string }[] | undefined,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();

  return headers?.find((h) => h.name.toLowerCase() === lower)?.value;
}

export function extract_message_ids(value: string | undefined): string[] {
  if (!value) return [];

  const bracketed = value.match(MSG_ID_PATTERN);

  if (bracketed && bracketed.length > 0) return bracketed;

  const bare = value.trim();

  if (bare && !/[\s<>]/.test(bare) && bare.includes("@")) {
    return [`<${bare}>`];
  }

  return [];
}

function fit_chain(ids: string[]): string {
  const joined = ids.join(" ");

  if (joined.length <= MAX_REPLY_REFERENCES_LENGTH || ids.length < 2) {
    return joined;
  }

  const root = ids[0];
  const tail: string[] = [];
  let length = root.length;

  for (let i = ids.length - 1; i > 0; i--) {
    const next = length + 1 + ids[i].length;

    if (next > MAX_REPLY_REFERENCES_LENGTH) break;
    tail.unshift(ids[i]);
    length = next;
  }

  if (tail.length === 0) return ids[ids.length - 1];

  return [root, ...tail].join(" ");
}

export function build_reply_references(
  headers: { name: string; value: string }[] | undefined,
): string | undefined {
  const own_ids = extract_message_ids(header_value(headers, "message-id"));

  if (own_ids.length === 0) return undefined;

  const parent = own_ids[0];
  const references = extract_message_ids(header_value(headers, "references"));
  const ancestors =
    references.length > 0
      ? references
      : extract_message_ids(header_value(headers, "in-reply-to"));

  const chain: string[] = [];

  for (const id of [...ancestors, parent]) {
    if (id !== parent && !chain.includes(id)) chain.push(id);
  }
  chain.push(parent);

  if (parent.length > MAX_REPLY_REFERENCES_LENGTH) return undefined;

  return fit_chain(chain);
}

export function resolve_reply_references(
  target: ReplyHeaderSource | undefined,
  thread_messages: ReplyHeaderSource[] = [],
): string | undefined {
  const direct = build_reply_references(target?.raw_headers);

  if (direct) return direct;

  const target_index = target
    ? thread_messages.findIndex((m) => m.id === target.id)
    : -1;
  const start =
    target_index >= 0 ? target_index - 1 : thread_messages.length - 1;

  for (let i = start; i >= 0; i--) {
    const found = build_reply_references(thread_messages[i].raw_headers);

    if (found) return found;
  }

  return undefined;
}
