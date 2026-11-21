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
import type { EncryptedVault } from "./key_manager_core";

import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64, base64_to_array } from "./base64";
import { zero_uint8_array } from "./secure_memory";

const SERVER_KNOWN_ID_DOMAIN = "aster-server-known-kek-v1";
const SERVER_KNOWN_KEY_LENGTH = 32;

const PUBLIC_KEK_MATERIAL = "undefined";
const PUBLIC_MAIL_KEK_CONTEXTS = [
  "astermail-envelope-v1",
  "astermail-import-v1",
] as const;
const PUBLIC_MAIL_KEKS: ReadonlySet<string> = new Set(
  PUBLIC_MAIL_KEK_CONTEXTS.map((context) =>
    array_to_base64(
      sha256(new TextEncoder().encode(PUBLIC_KEK_MATERIAL + context)),
    ),
  ),
);

export const MAX_SERVER_KNOWN_KEK_IDS = 64;

export function is_public_mail_kek(encoded: string): boolean {
  if (PUBLIC_MAIL_KEKS.has(encoded)) return true;

  try {
    return PUBLIC_MAIL_KEKS.has(array_to_base64(base64_to_array(encoded)));
  } catch {
    return false;
  }
}

type ServerKnownVault = Pick<
  EncryptedVault,
  "legacy_keks" | "storage_rekey" | "server_known_kek_ids"
>;

export interface ServerKnownStrip<T extends ServerKnownVault> {
  vault: T;
  removed: string[];
  removed_ids: string[];
}

let session_raws: Uint8Array[] = [];
let session_ids = new Set<string>();

export function server_known_kek_id(raw: Uint8Array): string {
  const domain = new TextEncoder().encode(SERVER_KNOWN_ID_DOMAIN);
  const input = new Uint8Array(domain.length + 1 + raw.length);

  input.set(domain, 0);
  input.set(raw, domain.length + 1);

  try {
    return array_to_base64(sha256(input));
  } finally {
    zero_uint8_array(input);
  }
}

function encoded_kek_id(encoded: string): string | null {
  let raw: Uint8Array;

  try {
    raw = base64_to_array(encoded);
  } catch {
    return null;
  }

  try {
    return raw.length === SERVER_KNOWN_KEY_LENGTH
      ? server_known_kek_id(raw)
      : null;
  } finally {
    zero_uint8_array(raw);
  }
}

export function note_server_known_raws(raws: readonly Uint8Array[]): string[] {
  const ids: string[] = [];

  for (const raw of raws) {
    if (raw.length !== SERVER_KNOWN_KEY_LENGTH) continue;

    const id = server_known_kek_id(raw);

    if (!session_ids.has(id)) {
      session_ids.add(id);
      session_raws.push(new Uint8Array(raw));
    }

    if (!ids.includes(id)) ids.push(id);
  }

  return ids;
}

export function clear_server_known_keys(): void {
  session_raws.forEach((raw) => zero_uint8_array(raw));
  session_raws = [];
  session_ids = new Set();
}

export interface UntrustedRaws {
  raws: Uint8Array[];
  ids: string[];
}

export function get_unswept_untrusted_raws(
  vault: Pick<EncryptedVault, "server_known_swept_ids">,
): UntrustedRaws {
  const swept = new Set(vault.server_known_swept_ids ?? []);
  const raws: Uint8Array[] = [];
  const ids: string[] = [];

  for (const raw of session_raws) {
    const id = server_known_kek_id(raw);

    if (swept.has(id)) continue;
    raws.push(new Uint8Array(raw));
    ids.push(id);
  }

  return { raws, ids };
}

export function get_session_server_known_ids(): string[] {
  return [...session_ids].sort();
}

function known_ids(vault: Pick<ServerKnownVault, "server_known_kek_ids">) {
  return new Set([...session_ids, ...(vault.server_known_kek_ids ?? [])]);
}

export function is_server_known_encoded(
  encoded: string,
  vault: Pick<ServerKnownVault, "server_known_kek_ids">,
): boolean {
  const id = encoded_kek_id(encoded);

  return id !== null && known_ids(vault).has(id);
}

export function merge_server_known_ids(
  existing: readonly string[] | undefined,
  added: readonly string[],
): string[] {
  const merged = [...(existing ?? [])];

  for (const id of added) {
    if (!merged.includes(id)) merged.push(id);
  }

  return merged.slice(Math.max(0, merged.length - MAX_SERVER_KNOWN_KEK_IDS));
}

export function strip_server_known_keks<T extends ServerKnownVault>(
  vault: T,
): ServerKnownStrip<T> {
  const ids = known_ids(vault);
  const removed: string[] = [];
  const removed_ids: string[] = [];

  if (ids.size === 0) return { vault, removed, removed_ids };

  const keep = (encoded: string): boolean => {
    const id = encoded_kek_id(encoded);

    if (id === null || !ids.has(id)) return true;

    if (!removed.includes(encoded)) removed.push(encoded);
    if (!removed_ids.includes(id)) removed_ids.push(id);

    return false;
  };
  const legacy_keks = vault.legacy_keks?.filter((entry) => keep(entry.k));
  const prior_keys = vault.storage_rekey?.prior_keys?.filter(keep);

  if (removed.length === 0) return { vault, removed, removed_ids };

  return {
    vault: {
      ...vault,
      legacy_keks,
      storage_rekey: vault.storage_rekey
        ? { ...vault.storage_rekey, prior_keys }
        : vault.storage_rekey,
    },
    removed,
    removed_ids,
  };
}
