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
import {
  hash_email,
  derive_password_hash,
  generate_identity_keypair,
  generate_signed_prekey,
  encrypt_vault,
} from "@/services/crypto/key_manager";
import {
  encrypt_message,
  decrypt_message_verified_with_any_key,
  reprotect_pgp_key,
  type sender_signing_key,
} from "@/services/crypto/key_manager_pgp";
import { array_to_base64 } from "@/services/crypto/key_manager_core";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
} from "@/services/crypto/memory_key_store";
import { MASTER_KEY_VAULT_FORMAT } from "@/services/crypto/memory_key_store";
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import { get_recipient_public_key } from "@/services/api/keys";
import type { CreateSharedMailboxParams } from "@/services/api/shared_mailboxes";

export const SHARED_MAILBOX_GRANT_VERSION = 1;

export interface SharedMailboxGrantPayload {
  v: number;
  mailbox_user_id: string;
  email: string;
  login_secret: string;
}

export interface GeneratedSharedMailbox {
  params: Omit<CreateSharedMailboxParams, "wrapped_grant">;
  login_secret: string;
  email: string;
  vault_data: EncryptedVault;
}

function generate_login_secret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = array_to_base64(bytes);

  bytes.fill(0);

  return secret;
}

export async function generate_shared_mailbox_material(
  username: string,
  email_domain: string,
  allocated_storage_bytes: number,
): Promise<GeneratedSharedMailbox> {
  const email = `${username}@${email_domain}`;
  const login_secret = generate_login_secret();

  const user_hash = await hash_email(email);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const { hash: password_hash, salt: password_salt } =
    await derive_password_hash(login_secret, salt);

  const identity_keypair = await generate_identity_keypair(
    username,
    email,
    login_secret,
  );

  const { keypair: signed_prekey, signature } = await generate_signed_prekey(
    username,
    email,
    login_secret,
    identity_keypair.secret_key,
  );

  const master_key = crypto.getRandomValues(new Uint8Array(32));
  const vault_data: EncryptedVault = {
    identity_key: identity_keypair.secret_key,
    signed_prekey: signed_prekey.public_key,
    signed_prekey_private: signed_prekey.secret_key,
    recovery_codes: [],
    data_kek: array_to_base64(master_key),
    vault_format: MASTER_KEY_VAULT_FORMAT,
    mk_created_at: new Date().toISOString(),
  };

  master_key.fill(0);

  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    vault_data,
    login_secret,
  );

  return {
    params: {
      username,
      email_domain,
      user_hash,
      password_hash,
      password_salt,
      argon2_params: { memory: 65536, iterations: 3, parallelism: 4 },
      identity_key: btoa(identity_keypair.public_key),
      signed_prekey: btoa(signed_prekey.public_key),
      signed_prekey_signature: btoa(signature),
      encrypted_vault,
      vault_nonce,
      vault_format: MASTER_KEY_VAULT_FORMAT,
      allocated_storage_bytes,
    },
    login_secret,
    email,
    vault_data,
  };
}

export function get_grant_signing_keys(): sender_signing_key[] {
  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) {
    throw new Error("your account must be unlocked to manage shared mailboxes");
  }

  return [vault.identity_key, ...(vault.previous_keys ?? [])].map(
    (armored_secret_key) => ({ armored_secret_key, passphrase }),
  );
}

export function get_grant_decryption_keys(): {
  secret_keys: string[];
  passphrase: string;
} {
  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) {
    throw new Error("your account must be unlocked to manage shared mailboxes");
  }

  return {
    secret_keys: [vault.identity_key, ...(vault.previous_keys ?? [])],
    passphrase,
  };
}

export async function fetch_member_public_key(
  username: string,
  email: string,
): Promise<string> {
  const response = await get_recipient_public_key(username, email);

  if (response.error || !response.data?.public_key) {
    throw new Error(response.error || "member public key unavailable");
  }

  return response.data.public_key;
}

export async function seal_grant(
  payload: SharedMailboxGrantPayload,
  recipient_public_key: string,
  signing_keys: sender_signing_key | sender_signing_key[],
): Promise<string> {
  const armored = await encrypt_message(
    JSON.stringify(payload),
    recipient_public_key,
    signing_keys,
  );

  return btoa(armored);
}

export async function unseal_grant(
  wrapped_grant: string,
  identity_private_keys: string | string[],
  passphrase: string,
  granter_public_keys: string | string[],
): Promise<SharedMailboxGrantPayload> {
  const armored = atob(wrapped_grant);
  const secret_keys = Array.isArray(identity_private_keys)
    ? identity_private_keys
    : [identity_private_keys];
  const verification_keys = Array.isArray(granter_public_keys)
    ? granter_public_keys
    : [granter_public_keys];
  const result = await decrypt_message_verified_with_any_key(
    armored,
    secret_keys,
    passphrase,
    verification_keys,
  );

  if (result.verification !== "verified") {
    throw new Error("shared mailbox grant signature could not be verified");
  }

  const payload = JSON.parse(result.plaintext) as SharedMailboxGrantPayload;

  if (
    payload.v !== SHARED_MAILBOX_GRANT_VERSION ||
    typeof payload.mailbox_user_id !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.login_secret !== "string"
  ) {
    throw new Error("invalid shared mailbox grant payload");
  }

  return payload;
}

export async function generate_rotated_credential(
  vault_data: EncryptedVault,
  old_login_secret: string,
): Promise<{
  login_secret: string;
  password_hash: string;
  password_salt: string;
  encrypted_vault: string;
  vault_nonce: string;
}> {
  const login_secret = generate_login_secret();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const { hash: password_hash, salt: password_salt } =
    await derive_password_hash(login_secret, salt);

  const rotated_vault: EncryptedVault = {
    ...vault_data,
    identity_key: await reprotect_pgp_key(
      vault_data.identity_key,
      old_login_secret,
      login_secret,
    ),
    signed_prekey_private: await reprotect_pgp_key(
      vault_data.signed_prekey_private,
      old_login_secret,
      login_secret,
    ),
  };

  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    rotated_vault,
    login_secret,
  );

  return {
    login_secret,
    password_hash,
    password_salt,
    encrypted_vault,
    vault_nonce,
  };
}
