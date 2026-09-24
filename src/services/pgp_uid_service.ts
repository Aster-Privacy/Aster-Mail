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

function safe_uid_name(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[<>@]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function has_email(ids: UserId[], email: string): boolean {
  const target = email.toLowerCase();

  return ids.some((id) => (id.email ?? "").toLowerCase() === target);
}

function stamp_local_vault(
  user_id: string | undefined,
  encrypted_vault: string,
  vault_nonce: string,
): void {
  if (!user_id) return;

  try {
    localStorage.setItem(`astermail_encrypted_vault_${user_id}`, encrypted_vault);
    localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);
  } catch (caught) {
    ignore_error("services/pgp_uid_service:stamp_local_vault", caught);
  }
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

  const expires_at = await unlocked.getExpirationTime();
  const created_at = unlocked.getCreationTime().getTime();
  const key_expiration_time =
    expires_at instanceof Date
      ? Math.max(0, Math.round((expires_at.getTime() - created_at) / 1000))
      : 0;

  const reformatted = await openpgp.reformatKey({
    privateKey: unlocked,
    userIDs: [
      { name: safe_uid_name(display_name, new_address), email: new_address },
      ...user_ids,
    ],
    keyExpirationTime: key_expiration_time,
    format: "object",
  });

  const protectedKey = await openpgp.encryptKey({
    privateKey: reformatted.privateKey,
    passphrase,
  });

  return { ...vault, identity_key: protectedKey.armor() };
}

let uid_update_in_flight: { key: string; run: Promise<boolean> } | null = null;

export async function republish_identity_with_new_address(
  new_address: string,
  display_name: string,
): Promise<boolean> {
  const account = await get_current_account();
  const key = `${account?.user?.id ?? ""}|${new_address.trim().toLowerCase()}`;

  if (uid_update_in_flight?.key === key) return uid_update_in_flight.run;

  const run = run_identity_republish(new_address, display_name);

  uid_update_in_flight = { key, run };

  try {
    return await run;
  } finally {
    if (uid_update_in_flight?.run === run) uid_update_in_flight = null;
  }
}

async function run_identity_republish(
  new_address: string,
  display_name: string,
): Promise<boolean> {
  try {
    return await with_vault_write_lock(async () => {
      const { sync_vault_with_server } = await import(
        "@/services/crypto/ensure_ratchet_keys"
      );
      const freshness = await sync_vault_with_server();

      if (freshness.status === "unverified") return false;

      const current_vault =
        freshness.status === "adopted"
          ? freshness.vault
          : get_vault_from_memory();
      const passphrase = get_passphrase_from_memory();

      if (!current_vault || !passphrase) return false;

      const next_vault = await add_address_to_identity_key(
        current_vault,
        passphrase,
        new_address,
        display_name,
      );

      const published_vault = next_vault ?? current_vault;

      if (next_vault) {
        const { encrypted_vault, vault_nonce } = await encrypt_vault(
          next_vault,
          passphrase,
        );

        const current_account = await get_current_account();
        const vault_saved = await update_vault(
          encrypted_vault,
          vault_nonce,
          next_vault.data_kek
            ? MASTER_KEY_VAULT_FORMAT
            : next_vault.vault_format,
          current_account?.user?.id,
          true,
          next_vault,
        );

        if (!vault_saved.success) return false;

        await store_vault_in_memory(next_vault, passphrase);
        stamp_local_vault(
          current_account?.user?.id,
          encrypted_vault,
          vault_nonce,
        );
      }

      const private_key = await openpgp.readPrivateKey({
        armoredKey: published_vault.identity_key,
      });

      const pgp_key_data = await prepare_pgp_key_data(
        {
          public_key: private_key.toPublic().armor(),
          secret_key: published_vault.identity_key,
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
