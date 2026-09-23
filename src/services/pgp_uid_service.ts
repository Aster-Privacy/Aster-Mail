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

import * as openpgp from "openpgp";

import {
  prepare_pgp_key_data,
  encrypt_vault,
} from "@/services/crypto/key_manager";
import { update_vault, republish_pgp_key } from "@/services/api/key_rotation";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
  store_vault_in_memory,
  MASTER_KEY_VAULT_FORMAT,
} from "@/services/crypto/memory_key_store";
import { with_vault_write_lock } from "@/services/crypto/vault_write_lock";
import { get_current_account } from "@/services/account_manager";
import { ignore_error } from "@/lib/ignore_error";

interface UserId {
  name?: string;
  email?: string;
}

function existing_user_ids(key: openpgp.Key): UserId[] {
  return key.getUserIDs().map((raw) => {
    const match = raw.match(/^(.*?)\s*<([^>]+)>$/);

    return match
      ? { name: match[1].trim(), email: match[2].trim() }
      : { name: raw.trim() };
  });
}

function has_email(ids: UserId[], email: string): boolean {
  const target = email.toLowerCase();

  return ids.some((id) => (id.email ?? "").toLowerCase() === target);
}

export async function add_address_to_identity_key(
  vault: EncryptedVault,
  passphrase: string,
  new_address: string,
  display_name: string,
): Promise<EncryptedVault | null> {
  const private_key = await openpgp.readPrivateKey({
    armoredKey: vault.identity_key,
  });

  const user_ids = existing_user_ids(private_key);

  if (has_email(user_ids, new_address)) return null;

  const unlocked = private_key.isDecrypted()
    ? private_key
    : await openpgp.decryptKey({ privateKey: private_key, passphrase });

  const reformatted = await openpgp.reformatKey({
    privateKey: unlocked,
    userIDs: [
      { name: display_name || new_address, email: new_address },
      ...user_ids,
    ],
    format: "object",
  });

  const protectedKey = await openpgp.encryptKey({
    privateKey: reformatted.privateKey,
    passphrase,
  });

  return { ...vault, identity_key: protectedKey.armor() };
}

export async function republish_identity_with_new_address(
  new_address: string,
  display_name: string,
): Promise<boolean> {
  try {
    return await with_vault_write_lock(async () => {
      const current_vault = get_vault_from_memory();
      const passphrase = get_passphrase_from_memory();

      if (!current_vault || !passphrase) return false;

      const next_vault = await add_address_to_identity_key(
        current_vault,
        passphrase,
        new_address,
        display_name,
      );

      if (!next_vault) return true;

      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        next_vault,
        passphrase,
      );

      const current_account = await get_current_account();
      const vault_saved = await update_vault(
        encrypted_vault,
        vault_nonce,
        next_vault.data_kek ? MASTER_KEY_VAULT_FORMAT : next_vault.vault_format,
        current_account?.user?.id,
        true,
        next_vault,
      );

      if (!vault_saved.success) return false;

      await store_vault_in_memory(next_vault, passphrase);

      const private_key = await openpgp.readPrivateKey({
        armoredKey: next_vault.identity_key,
      });

      const pgp_key_data = await prepare_pgp_key_data(
        {
          public_key: private_key.toPublic().armor(),
          secret_key: next_vault.identity_key,
          fingerprint: private_key.getFingerprint().toUpperCase(),
        },
        passphrase,
      );

      const published = await republish_pgp_key(
        pgp_key_data as unknown as Record<string, unknown>,
      );

      return published.data?.success === true;
    });
  } catch (caught) {
    ignore_error(
      "services/pgp_uid_service:republish_identity_with_new_address",
      caught,
    );

    return false;
  }
}
