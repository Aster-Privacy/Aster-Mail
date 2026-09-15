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
export interface RawHeader {
  name: string;
  value: string;
}

const MAX_CHAIN_IDS = 20;

function header_value(
  headers: RawHeader[] | undefined,
  name: string,
): string | undefined {
  const found = headers?.find(
    (h) => h.name.trim().toLowerCase() === name,
  )?.value;

  return found?.trim() || undefined;
}

function message_ids(value: string): string[] {
  return value.match(/<[^<>\s]+>/g) ?? [];
}

export function build_reply_chain(
  headers: RawHeader[] | undefined,
): string | undefined {
  const parent = message_ids(header_value(headers, "message-id") ?? "").slice(
    0,
    1,
  );

  if (parent.length === 0) return undefined;

  const references = message_ids(header_value(headers, "references") ?? "");
  const chain = [...references, ...parent].filter(
    (id, index, all) => all.indexOf(id) === index,
  );

  return chain.slice(-MAX_CHAIN_IDS).join(" ");
}
