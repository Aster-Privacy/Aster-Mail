import * as openpgp from "openpgp";

import {
  type EncryptedVault,
  generate_identity_keypair,
  generate_signed_prekey,
  encrypt_vault,
} from "@/services/crypto/key_manager";
import {
  get_identity_key_status,
  rotate_identity_key,
  type RotateIdentityKeyRequest,
} from "@/services/api/key_rotation";
import { type UserPreferences } from "@/services/api/preferences";

export interface RotationCheckResult {
  needs_rotation: boolean;
  key_age_hours: number | null;
  key_fingerprint: string | null;
  current_public_key: string | null;
  error?: string;
}

export interface RotationResult {
  success: boolean;
  new_vault?: EncryptedVault;
  encrypted_vault?: string;
  vault_nonce?: string;
  new_fingerprint?: string;
  error?: string;
}

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }

  return btoa(binary);
}

async function compute_rotation_proof(
  current_key_hash: Uint8Array,
  new_key_bytes: Uint8Array,
): Promise<string> {
  const combined = new Uint8Array(
    current_key_hash.length + new_key_bytes.length,
  );

  combined.set(current_key_hash, 0);
  combined.set(new_key_bytes, current_key_hash.length);

  const hash = await crypto.subtle.digest("SHA-256", combined);

  return array_to_base64(new Uint8Array(hash));
}

async function compute_key_hash(public_key: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key_bytes = encoder.encode(public_key);
  const hash = await crypto.subtle.digest("SHA-256", key_bytes);

  return new Uint8Array(hash);
}

export async function check_rotation_needed(
  preferences: UserPreferences,
): Promise<RotationCheckResult> {
  if (!preferences.forward_secrecy_enabled) {
    return {
      needs_rotation: false,
      key_age_hours: null,
      key_fingerprint: null,
      current_public_key: null,
    };
  }

  try {
    const response = await get_identity_key_status();

    if (response.error || !response.data) {
      return {
        needs_rotation: false,
        key_age_hours: null,
        key_fingerprint: null,
        current_public_key: null,
        error: response.error ?? "Failed to get key status",
      };
    }

    const { key_age_hours, key_fingerprint, current_public_key } =
      response.data;

    if (key_age_hours === null) {
      return {
        needs_rotation: false,
        key_age_hours: null,
        key_fingerprint: null,
        current_public_key: null,
      };
    }

    const needs_rotation = key_age_hours >= preferences.key_rotation_hours;

    return {
      needs_rotation,
      key_age_hours,
      key_fingerprint,
      current_public_key,
    };
  } catch (error) {
    return {
      needs_rotation: false,
      key_age_hours: null,
      key_fingerprint: null,
      current_public_key: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function perform_key_rotation(
  current_vault: EncryptedVault,
  password: string,
  user_email: string,
  user_name: string,
  key_history_limit: number,
  server_public_key: string,
): Promise<RotationResult> {
  try {
    const current_public_key = atob(server_public_key);
    const current_key_hash = await compute_key_hash(current_public_key);

    const new_keypair = await generate_identity_keypair(
      user_name,
      user_email,
      password,
    );

    const { keypair: new_prekey, signature: prekey_signature } =
      await generate_signed_prekey(
        user_name,
        user_email,
        password,
        new_keypair.private_key,
      );

    let previous_keys = current_vault.previous_keys
      ? [...current_vault.previous_keys]
      : [];

    previous_keys.unshift(current_vault.identity_key);

    if (key_history_limit > 0 && previous_keys.length > key_history_limit) {
      previous_keys = previous_keys.slice(0, key_history_limit);
    }

    const new_vault: EncryptedVault = {
      identity_key: new_keypair.private_key,
      previous_keys,
      signed_prekey: new_prekey.public_key,
      signed_prekey_private: new_prekey.private_key,
      recovery_codes: current_vault.recovery_codes,
    };

    const { encrypted_vault, vault_nonce } = await encrypt_vault(
      new_vault,
      password,
    );

    const new_key_bytes = new TextEncoder().encode(new_keypair.public_key);
    const rotation_proof = await compute_rotation_proof(
      current_key_hash,
      new_key_bytes,
    );

    const prekey_id_bytes = new Uint32Array(1);

    crypto.getRandomValues(prekey_id_bytes);
    const prekey_id = prekey_id_bytes[0] % 2147483647;

    const request: RotateIdentityKeyRequest = {
      new_identity_key: btoa(new_keypair.public_key),
      rotation_signature: rotation_proof,
      new_signed_prekey: btoa(new_prekey.public_key),
      new_signed_prekey_id: prekey_id,
      new_signed_prekey_signature: btoa(prekey_signature),
      encrypted_vault,
      vault_nonce,
    };

    const response = await rotate_identity_key(request);

    if (response.error || !response.data?.success) {
      return { success: false, error: response.error ?? "Rotation failed" };
    }

    return {
      success: true,
      new_vault,
      encrypted_vault,
      vault_nonce,
      new_fingerprint: response.data.new_key_fingerprint ?? undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown rotation error",
    };
  }
}

export async function get_decryption_key_for_message(
  vault: EncryptedVault,
  encrypted_message: string,
  passphrase: string,
): Promise<string | null> {
  const keys_to_try = [vault.identity_key, ...(vault.previous_keys ?? [])];

  for (const private_key_armored of keys_to_try) {
    try {
      const private_key = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({
          armoredKey: private_key_armored,
        }),
        passphrase,
      });

      const message = await openpgp.readMessage({
        armoredMessage: encrypted_message,
      });

      await openpgp.decrypt({
        message,
        decryptionKeys: private_key,
      });

      return private_key_armored;
    } catch {
      continue;
    }
  }

  return null;
}

export async function decrypt_with_key_fallback(
  vault: EncryptedVault,
  encrypted_message: string,
  passphrase: string,
): Promise<{ decrypted: string; used_key_index: number } | null> {
  const keys_to_try = [vault.identity_key, ...(vault.previous_keys ?? [])];

  for (let i = 0; i < keys_to_try.length; i++) {
    try {
      const private_key = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({
          armoredKey: keys_to_try[i],
        }),
        passphrase,
      });

      const message = await openpgp.readMessage({
        armoredMessage: encrypted_message,
      });
      const { data } = await openpgp.decrypt({
        message,
        decryptionKeys: private_key,
      });

      return { decrypted: data.toString(), used_key_index: i };
    } catch {
      continue;
    }
  }

  return null;
}
