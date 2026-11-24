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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { array_to_base64, base64_to_array } from "@/services/crypto/base64";
import { MAX_LEGACY_KEKS } from "@/services/crypto/legacy_keks";
import {
  is_public_constant_kek_raw,
  retired_kek_context,
} from "@/services/crypto/retired_identity_keks";
import { is_public_mail_kek } from "@/services/crypto/server_known_keys";

const KEY_LENGTH = 32;

export const EXTENSION_KEYS_VERSION = 1;

type LinkVault = Pick<EncryptedVault, "data_kek" | "legacy_keks">;

function decode_key(encoded: string): Uint8Array | null {
  try {
    const raw = base64_to_array(encoded);

    if (raw.length === KEY_LENGTH) return raw;
    raw.fill(0);
  } catch {
    return null;
  }

  return null;
}

function alias_fallback_keys(vault: LinkVault, data_kek: string): string[] {
  const kept = new Set<string>();

  for (const entry of vault.legacy_keks ?? []) {
    if (kept.size >= MAX_LEGACY_KEKS) break;
    const raw = decode_key(entry.k);

    if (!raw) continue;

    const normalized = array_to_base64(raw);
    const is_public =
      is_public_constant_kek_raw(raw) ||
      retired_kek_context(normalized) !== null ||
      is_public_mail_kek(normalized);

    raw.fill(0);
    if (is_public || normalized === data_kek) continue;
    kept.add(normalized);
  }

  return [...kept];
}

export function encode_extension_link_keys(
  vault: LinkVault | null,
): Uint8Array {
  const data_kek = vault?.data_kek;
  const raw = data_kek ? decode_key(data_kek) : null;

  if (!vault || !data_kek || !raw) throw new Error("vault_locked");

  const normalized = array_to_base64(raw);

  raw.fill(0);

  return new TextEncoder().encode(
    JSON.stringify({
      v: EXTENSION_KEYS_VERSION,
      data_kek: normalized,
      legacy: alias_fallback_keys(vault, normalized),
    }),
  );
}
