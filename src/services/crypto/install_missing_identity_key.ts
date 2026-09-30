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
import type {
  EncryptedVault,
  PgpKeyData,
} from "@/services/crypto/key_manager_core";

import { ACCOUNT_DATA_CONTEXTS } from "@/services/crypto/account_data_key";
import {
  prepend_kek_to_list,
  serialize_kek_for_vault,
} from "@/services/crypto/legacy_keks";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { HASH_ALG } from "@/services/crypto/constants";

const MISSING_IDENTITY_KEY_MATERIAL = "undefined";

export interface IdentityKeyInstall {
  new_vault: EncryptedVault;
  pgp_key_data: PgpKeyData;
}

export function vault_lacks_identity_key(
  vault: EncryptedVault | null | undefined,
): boolean {
  return !!vault && !vault.identity_key;
}

export async function derive_missing_identity_keks(): Promise<Uint8Array[]> {
  const encoder = new TextEncoder();
  const keks: Uint8Array[] = [];

  for (const context of ACCOUNT_DATA_CONTEXTS) {
    const material = encoder.encode(MISSING_IDENTITY_KEY_MATERIAL + context);

    keks.push(new Uint8Array(await crypto.subtle.digest(HASH_ALG, material)));
  }

  return keks;
}

export async function build_identity_key_install(
  current_vault: EncryptedVault,
  passphrase: string,
  user_email: string,
  user_name: string,
): Promise<IdentityKeyInstall> {
  const { generate_identity_keypair, prepare_pgp_key_data } =
    await import("@/services/crypto/key_manager");
  const keypair = await generate_identity_keypair(
    user_name,
    user_email,
    passphrase,
  );

  let legacy_keks = current_vault.legacy_keks;

  for (const raw of await derive_missing_identity_keks()) {
    legacy_keks = prepend_kek_to_list(
      legacy_keks,
      serialize_kek_for_vault(raw),
    );
    zero_uint8_array(raw);
  }

  const new_vault: EncryptedVault = {
    ...current_vault,
    identity_key: keypair.secret_key,
    legacy_keks,
  };

  const pgp_key_data = await prepare_pgp_key_data(keypair, passphrase);

  return { new_vault, pgp_key_data };
}

let install_in_progress = false;

export async function install_missing_identity_key(
  user_email: string | null,
  user_name: string | null,
): Promise<boolean> {
  if (install_in_progress || !user_email) return false;

  const { get_vault_from_memory, get_passphrase_from_memory } =
    await import("@/services/crypto/memory_key_store");

  if (!vault_lacks_identity_key(get_vault_from_memory())) return false;
  if (!get_passphrase_from_memory()) return false;

  install_in_progress = true;

  try {
    const { with_vault_write_lock } =
      await import("@/services/crypto/vault_write_lock");

    return await with_vault_write_lock(() =>
      install_under_lock(user_email, user_name || user_email),
    );
  } catch (caught) {
    const { ignore_error } = await import("@/lib/ignore_error");

    ignore_error(
      "services/crypto/install_missing_identity_key:install",
      caught,
    );

    return false;
  } finally {
    install_in_progress = false;
  }
}

async function install_under_lock(
  user_email: string,
  user_name: string,
): Promise<boolean> {
  const { sync_vault_with_server } =
    await import("@/services/crypto/ensure_ratchet_keys");
  const {
    get_vault_from_memory,
    get_passphrase_from_memory,
    store_vault_in_memory,
    MASTER_KEY_VAULT_FORMAT,
  } = await import("@/services/crypto/memory_key_store");

  const freshness = await sync_vault_with_server();

  if (freshness.status === "unverified") return false;

  const vault =
    freshness.status === "adopted" ? freshness.vault : get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase || !vault_lacks_identity_key(vault)) return false;

  const { encrypt_vault } = await import("@/services/crypto/key_manager");
  const { update_vault, republish_pgp_key } =
    await import("@/services/api/key_rotation");
  const { get_current_account } = await import("@/services/account_manager");

  const { new_vault, pgp_key_data } = await build_identity_key_install(
    vault,
    passphrase,
    user_email,
    user_name,
  );

  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    new_vault,
    passphrase,
  );
  const account = await get_current_account();
  const saved = await update_vault(
    encrypted_vault,
    vault_nonce,
    vault.data_kek ? MASTER_KEY_VAULT_FORMAT : new_vault.vault_format,
    account?.user?.id,
    true,
    new_vault,
  );

  if (!saved.success) return false;

  await store_vault_in_memory(new_vault, passphrase);

  const published = await republish_pgp_key(
    pgp_key_data as unknown as Record<string, unknown>,
  );

  const { upload_prekey_bundle } =
    await import("@/services/crypto/ratchet_manager");
  const { ensure_default_labels } =
    await import("@/services/labels/ensure_defaults");
  const { ignore_error } = await import("@/lib/ignore_error");

  await upload_prekey_bundle(new_vault).catch((caught) =>
    ignore_error(
      "services/crypto/install_missing_identity_key:prekeys",
      caught,
    ),
  );
  await ensure_default_labels(new_vault).catch((caught) =>
    ignore_error("services/crypto/install_missing_identity_key:labels", caught),
  );

  return !published.error && published.data?.success === true;
}
