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

import { encrypt_envelope_with_identity_key } from "./envelope";
import {
  encrypt_envelope_v2,
  envelope_v2_write_key,
  wipe_envelope_v2_keys,
} from "./envelope_v2";
import { stored_envelope_binding } from "./stored_envelope_read";
import { is_level2_admitted } from "./vault_level2";

import { peek_account_key_capabilities } from "@/services/api/account_key";

export function stored_envelope_write_binding(
  item_id: string | null | undefined,
): StoredEnvelopeBinding | undefined {
  if (!peek_account_key_capabilities().bound_envelope_writes) return undefined;

  return stored_envelope_binding(item_id);
}

export async function encrypt_envelope_for_storage(
  data: object,
  vault: EncryptedVault,
  item_id?: string,
): Promise<{ encrypted: string; nonce: string }> {
  const data_kek = is_level2_admitted() ? envelope_v2_write_key(vault) : null;

  if (data_kek) {
    try {
      return await encrypt_envelope_v2(
        data,
        data_kek,
        stored_envelope_write_binding(item_id),
      );
    } finally {
      wipe_envelope_v2_keys([data_kek]);
    }
  }

  return encrypt_envelope_with_identity_key(data, vault.identity_key);
}
