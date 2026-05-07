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
import { encrypt_vault } from "./key_manager";
import {
  get_vault_from_memory,
  store_vault_in_memory,
  get_passphrase_from_memory,
} from "./memory_key_store";
import { generate_ratchet_keys, upload_prekey_bundle } from "./ratchet_manager";
import { get_current_account } from "../account_manager";

let in_flight: Promise<boolean> | null = null;

export async function ensure_ratchet_keys(): Promise<boolean> {
  if (in_flight) return in_flight;

  in_flight = run().finally(() => {
    in_flight = null;
  });

  return in_flight;
}

async function run(): Promise<boolean> {
  try {
    const vault = get_vault_from_memory();

    if (!vault) return false;

    if (
      vault.ratchet_identity_key &&
      vault.ratchet_identity_public &&
      vault.ratchet_signed_prekey &&
      vault.ratchet_signed_prekey_public
    ) {
      upload_prekey_bundle(vault).catch(() => {});

      return true;
    }

    const passphrase = get_passphrase_from_memory();

    if (!passphrase) return false;

    const account = await get_current_account();
    const user_id = account?.user?.id;

    if (!user_id) return false;

    const ratchet_keys = await generate_ratchet_keys();

    if (!ratchet_keys) return false;

    vault.ratchet_identity_key = ratchet_keys.identity_jwk;
    vault.ratchet_identity_public = ratchet_keys.identity_public;
    vault.ratchet_signed_prekey = ratchet_keys.signed_prekey_jwk;
    vault.ratchet_signed_prekey_public = ratchet_keys.signed_prekey_public;

    await store_vault_in_memory(vault, passphrase);

    const { encrypted_vault, vault_nonce } = await encrypt_vault(
      vault,
      passphrase,
    );

    localStorage.setItem(
      `astermail_encrypted_vault_${user_id}`,
      encrypted_vault,
    );
    localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);

    await upload_prekey_bundle(vault);

    return true;
  } catch {
    return false;
  }
}
