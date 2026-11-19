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
import { merge_server_known_ids } from "./server_known_keys";

const RETIRED_STORAGE_KEK_DOMAIN = "aster-retired-storage-kek-v1";

type RetireVault = Pick<
  EncryptedVault,
  "legacy_keks" | "pending_retire_kek_ids" | "retired_storage_kek_ids"
>;

export function retired_storage_kek_id(raw: Uint8Array): string {
  const domain = new TextEncoder().encode(RETIRED_STORAGE_KEK_DOMAIN);
  const input = new Uint8Array(domain.length + 1 + raw.length);

  input.set(domain, 0);
  input.set(raw, domain.length + 1);

  try {
    return array_to_base64(sha256(input));
  } finally {
    zero_uint8_array(input);
  }
}

function encoded_id(encoded: string): string | null {
  let raw: Uint8Array;

  try {
    raw = base64_to_array(encoded);
  } catch {
    return null;
  }

  try {
    return raw.length > 0 ? retired_storage_kek_id(raw) : null;
  } finally {
    zero_uint8_array(raw);
  }
}

export function mark_keks_for_retirement(
  existing: readonly string[] | undefined,
  raws: readonly Uint8Array[],
  keep_encoded?: string,
): string[] {
  const keep = keep_encoded ? encoded_id(keep_encoded) : null;
  const ids = raws
    .filter((raw) => raw.length > 0)
    .map((raw) => retired_storage_kek_id(raw))
    .filter((id) => id !== keep);

  return merge_server_known_ids(existing, ids);
}

export function legacy_kek_ids(
  vault: Pick<EncryptedVault, "legacy_keks">,
): string[] {
  const ids: string[] = [];

  for (const entry of vault.legacy_keks ?? []) {
    const id = encoded_id(entry.k);

    if (id !== null && !ids.includes(id)) ids.push(id);
  }

  return ids;
}

export function strip_retired_storage_keks<T extends RetireVault>(vault: T): T {
  const retired = new Set(vault.retired_storage_kek_ids ?? []);

  if (retired.size === 0) return vault;

  const legacy_keks = vault.legacy_keks?.filter((entry) => {
    const id = encoded_id(entry.k);

    return id === null || !retired.has(id);
  });
  const pending = vault.pending_retire_kek_ids?.filter(
    (id) => !retired.has(id),
  );
  const unchanged =
    (legacy_keks?.length ?? 0) === (vault.legacy_keks?.length ?? 0) &&
    (pending?.length ?? 0) === (vault.pending_retire_kek_ids?.length ?? 0);

  if (unchanged) return vault;

  const next: T = { ...vault, legacy_keks };

  if (pending && pending.length > 0) {
    next.pending_retire_kek_ids = pending;
  } else {
    delete next.pending_retire_kek_ids;
  }

  return next;
}

export function retire_swept_keks<T extends RetireVault>(
  vault: T,
  swept_ids: readonly string[],
): T | null {
  const swept = new Set(swept_ids);
  const ready = (vault.pending_retire_kek_ids ?? []).filter((id) =>
    swept.has(id),
  );

  if (ready.length === 0) return null;

  return strip_retired_storage_keks({
    ...vault,
    retired_storage_kek_ids: merge_server_known_ids(
      vault.retired_storage_kek_ids,
      ready,
    ),
  });
}
