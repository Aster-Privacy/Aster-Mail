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
import type { ParsedEmail } from "@/services/import/types";

import { canonical_alias_address } from "@/components/email/inbox/inbox_view_helpers";
import { extract_email_address } from "@/services/import/mime_utils";

export interface ImportAddressEntry {
  address: string;
  hash: string;
}

export interface ImportRouting {
  routing_token?: string;
  sender_alias_hash?: string;
}

const DELIVERY_HEADERS = ["delivered-to", "x-original-to", "envelope-to"];

export function build_import_hash_map(
  entries: ImportAddressEntry[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.address || !entry.hash) continue;
    const key = canonical_alias_address(entry.address);

    if (key.includes("@") && !map.has(key)) map.set(key, entry.hash);
  }

  return map;
}

function hash_for(
  value: string | undefined,
  map: Map<string, string>,
): string | undefined {
  if (!value) return undefined;
  const address = extract_email_address(value);

  if (!address) return undefined;

  return map.get(canonical_alias_address(address));
}

export function is_owned_import_address(
  value: string | undefined,
  map: Map<string, string>,
): boolean {
  return hash_for(value, map) !== undefined;
}

export function resolve_import_routing(
  email: Pick<ParsedEmail, "from" | "to" | "cc" | "bcc" | "raw_headers">,
  is_sent: boolean,
  map: Map<string, string>,
): ImportRouting {
  if (map.size === 0) return {};

  if (is_sent) {
    const sender_alias_hash = hash_for(email.from, map);

    return sender_alias_hash ? { sender_alias_hash } : {};
  }

  const headers = email.raw_headers ?? {};
  const candidates = [
    ...DELIVERY_HEADERS.map((name) => headers[name]),
    ...(email.to ?? []),
    ...(email.cc ?? []),
    ...(email.bcc ?? []),
  ];

  for (const candidate of candidates) {
    const routing_token = hash_for(candidate, map);

    if (routing_token) return { routing_token };
  }

  return {};
}
