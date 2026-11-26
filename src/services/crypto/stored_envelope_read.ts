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
import type { StoredEnvelopeBinding } from "./envelope_v2";

import { decrypt_envelope_v2_with_vault } from "./envelope_v2";
import { get_vault_owner_id } from "./memory_key_store";
import { raise_bound_envelope_floor } from "./stored_envelope_floor";

export function stored_envelope_binding(
  item_id: string | null | undefined,
): StoredEnvelopeBinding | undefined {
  const owner_id = get_vault_owner_id();

  if (!item_id || !owner_id) return undefined;

  return { owner_id, item_id };
}

export function is_stored_envelope_sentinel(nonce_bytes: Uint8Array): boolean {
  return nonce_bytes.length === 1 && (nonce_bytes[0] === 2 || nonce_bytes[0] === 3);
}

export async function open_stored_envelope<T>(
  encrypted: string,
  nonce_bytes: Uint8Array,
  vault: EncryptedVault | null | undefined,
  item_id: string | null | undefined,
): Promise<T | null> {
  if (!is_stored_envelope_sentinel(nonce_bytes)) return null;
  if (nonce_bytes[0] === 2) {
    return decrypt_envelope_v2_with_vault<T>(encrypted, vault);
  }

  const binding = stored_envelope_binding(item_id);

  if (!binding) return null;

  const opened = await decrypt_envelope_v2_with_vault<T>(
    encrypted,
    vault,
    binding,
  );

  if (opened !== null) raise_bound_envelope_floor(binding.owner_id);

  return opened;
}
