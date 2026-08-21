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
import { collect_vault_key_fingerprints } from "./vault_key_fingerprints";
import type { EncryptedVault } from "./key_manager";

import { get_current_account } from "../account_manager";
import { api_client } from "../api/client";

import { encrypt_vault, decrypt_vault } from "./key_manager";
import {
  is_master_key_vault,
  derive_encryption_key_from_passphrase,
  get_vault_from_memory,
  store_vault_in_memory,
  MASTER_KEY_VAULT_FORMAT,
} from "./memory_key_store";
import { with_vault_write_lock } from "./vault_write_lock";
import { array_to_base64 } from "./key_manager_core";
import { prepend_kek_to_list, serialize_kek_for_vault } from "./legacy_keks";
import { zero_uint8_array } from "./secure_memory";

import { ignore_error } from "@/lib/ignore_error";

let adoption_in_flight: Promise<boolean> | null = null;

export async function adopt_master_key_if_needed(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if (adoption_in_flight) return adoption_in_flight;

  adoption_in_flight = with_vault_write_lock(() =>
    run_adoption(get_vault_from_memory() ?? vault, passphrase),
  ).finally(() => {
    adoption_in_flight = null;
  });

  return adoption_in_flight;
}

export function is_mk_adoption_enabled(): boolean {
  return import.meta.env.VITE_MK_ADOPTION_ENABLED === "true";
}

async function run_adoption(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if (!is_mk_adoption_enabled()) return false;

  if (is_master_key_vault(vault)) return false;

  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  const account = await get_current_account();
  const user_id = account?.user?.id;

  if (!user_id) return false;

  const passphrase_bytes = new TextEncoder().encode(passphrase);
  const master_key =
    await derive_encryption_key_from_passphrase(passphrase_bytes);

  zero_uint8_array(passphrase_bytes);

  const upgraded: EncryptedVault = {
    ...vault,
    data_kek: array_to_base64(master_key),
    vault_format: MASTER_KEY_VAULT_FORMAT,
    mk_created_at: new Date().toISOString(),
    legacy_keks: prepend_kek_to_list(
      vault.legacy_keks,
      serialize_kek_for_vault(master_key),
    ),
  };

  zero_uint8_array(master_key);

  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    upgraded,
    passphrase,
  );

  try {
    const roundtrip = await decrypt_vault(
      encrypted_vault,
      vault_nonce,
      passphrase,
    );

    if (
      roundtrip.identity_key !== upgraded.identity_key ||
      roundtrip.data_kek !== upgraded.data_kek ||
      (roundtrip.vault_format ?? 1) < MASTER_KEY_VAULT_FORMAT
    ) {
      return false;
    }
  } catch {
    return false;
  }

  const vault_key_fingerprints = await collect_vault_key_fingerprints(upgraded);

  const response = await api_client.put("/crypto/v1/keys/vault", {
    encrypted_vault,
    vault_nonce,
    expected_user_id: user_id,
    vault_format: MASTER_KEY_VAULT_FORMAT,
    preserve_pq_prekeys: true,
    ...(vault_key_fingerprints.length ? { vault_key_fingerprints } : {}),
  });

  if (response.error) return false;

  try {
    localStorage.setItem(
      `astermail_encrypted_vault_${user_id}`,
      encrypted_vault,
    );
    localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);
  } catch (caught) {
    ignore_error("services/crypto/mk_adoption:run_adoption", caught);
  }

  await store_vault_in_memory(upgraded, passphrase);

  return true;
}
