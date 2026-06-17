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
import { encrypt_vault, decrypt_vault } from "./key_manager";
import {
  get_vault_from_memory,
  store_vault_in_memory,
  get_passphrase_from_memory,
} from "./memory_key_store";
import {
  generate_ratchet_keys,
  generate_pq_identity_keys,
  upload_prekey_bundle,
} from "./ratchet_manager";
import { clear_all_ratchet_states } from "./double_ratchet";
import { get_current_account } from "../account_manager";
import { api_client } from "../api/client";

function get_stored_account_vault(
  user_id: string,
): { encrypted_vault: string; vault_nonce: string } | null {
  try {
    const encrypted_vault = localStorage.getItem(
      `astermail_encrypted_vault_${user_id}`,
    );
    const vault_nonce = localStorage.getItem(
      `astermail_vault_nonce_${user_id}`,
    );

    return encrypted_vault && vault_nonce
      ? { encrypted_vault, vault_nonce }
      : null;
  } catch {
    return null;
  }
}

async function passphrase_matches_account(
  user_id: string,
  passphrase: string,
  expected_identity_key: string,
): Promise<boolean> {
  const stored = get_stored_account_vault(user_id);

  if (!stored) return false;

  try {
    const decrypted = await decrypt_vault(
      stored.encrypted_vault,
      stored.vault_nonce,
      passphrase,
    );

    return decrypted.identity_key === expected_identity_key;
  } catch {
    return false;
  }
}

async function verify_vault_roundtrip(
  encrypted_vault: string,
  vault_nonce: string,
  passphrase: string,
  expected_identity_key: string,
): Promise<boolean> {
  try {
    const decrypted = await decrypt_vault(
      encrypted_vault,
      vault_nonce,
      passphrase,
    );

    return decrypted.identity_key === expected_identity_key;
  } catch {
    return false;
  }
}

async function push_vault_to_server(
  encrypted_vault: string,
  vault_nonce: string,
  expected_user_id: string,
): Promise<boolean> {
  const current_account = await get_current_account();

  if (current_account?.user?.id !== expected_user_id) return false;

  const response = await api_client.put("/crypto/v1/keys/vault", {
    encrypted_vault,
    vault_nonce,
    expected_user_id,
  });

  return !response.error;
}

let in_flight: Promise<boolean> | null = null;

export async function ensure_ratchet_keys(): Promise<boolean> {
  if (in_flight) return in_flight;

  in_flight = run().finally(() => {
    in_flight = null;
  });

  return in_flight;
}

function base64url_to_bytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64_to_bytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function keypairs_consistent(
  jwk_string: string,
  public_b64: string,
): Promise<boolean> {
  try {
    const jwk: JsonWebKey = JSON.parse(jwk_string);

    if (!jwk.x || !jwk.y || !jwk.d) return false;

    const x = base64url_to_bytes(jwk.x);
    const y = base64url_to_bytes(jwk.y);

    if (x.length !== 32 || y.length !== 32) return false;

    const derived = new Uint8Array(65);

    derived[0] = 0x04;
    derived.set(x, 1);
    derived.set(y, 33);

    const stored = base64_to_bytes(public_b64);

    if (stored.length !== 65) return false;

    for (let i = 0; i < 65; i++) {
      if (derived[i] !== stored[i]) return false;
    }

    const stored_public = await crypto.subtle.importKey(
      "raw",
      stored,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );

    const jwk_private = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );

    const temp = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );

    const [dh_a, dh_b] = await Promise.all([
      crypto.subtle.deriveBits(
        { name: "ECDH", public: stored_public },
        temp.privateKey,
        256,
      ),
      crypto.subtle.deriveBits(
        { name: "ECDH", public: temp.publicKey },
        jwk_private,
        256,
      ),
    ]);

    const a = new Uint8Array(dh_a);
    const b = new Uint8Array(dh_b);

    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }

    return true;
  } catch {
    return false;
  }
}

const FORCED_REGEN_KEY = "astermail_ratchet_regen_v4";

const RATCHET_PREVIOUS_KEY_RETENTION = 32;

async function run(): Promise<boolean> {
  try {
    const vault = get_vault_from_memory();

    if (!vault) return false;

    const has_ecdh =
      !!vault.ratchet_identity_key &&
      !!vault.ratchet_identity_public &&
      !!vault.ratchet_signed_prekey &&
      !!vault.ratchet_signed_prekey_public;

    const has_pq =
      !!vault.ratchet_pq_identity_key && !!vault.ratchet_pq_identity_public;

    const need_forced_regen = !localStorage.getItem(FORCED_REGEN_KEY);

    const ecdh_consistent =
      !need_forced_regen &&
      has_ecdh &&
      (await keypairs_consistent(
        vault.ratchet_identity_key!,
        vault.ratchet_identity_public!,
      )) &&
      (await keypairs_consistent(
        vault.ratchet_signed_prekey!,
        vault.ratchet_signed_prekey_public!,
      ));

    if (has_ecdh && has_pq && ecdh_consistent) {
      upload_prekey_bundle(vault).catch(() => {});

      return true;
    }

    const passphrase = get_passphrase_from_memory();

    if (!passphrase) return false;

    const account = await get_current_account();
    const user_id = account?.user?.id;

    if (!user_id) return false;

    const passphrase_ok = await passphrase_matches_account(
      user_id,
      passphrase,
      vault.identity_key,
    );

    if (!passphrase_ok) return false;

    if (has_ecdh && ecdh_consistent && !has_pq) {
      const pq_keys = await generate_pq_identity_keys();

      vault.ratchet_pq_identity_key = pq_keys.pq_identity_secret;
      vault.ratchet_pq_identity_public = pq_keys.pq_identity_public;
    } else {
      const ratchet_keys = await generate_ratchet_keys();

      if (!ratchet_keys) return false;

      if (has_ecdh) {
        const old_set = {
          ratchet_identity_key: vault.ratchet_identity_key!,
          ratchet_identity_public: vault.ratchet_identity_public!,
          ratchet_signed_prekey: vault.ratchet_signed_prekey!,
          ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public!,
        };
        const previous = vault.ratchet_previous_keys ?? [];
        const merged = [old_set, ...previous];
        const seen = new Set<string>();
        vault.ratchet_previous_keys = merged
          .filter((set) => {
            if (seen.has(set.ratchet_identity_public)) return false;
            seen.add(set.ratchet_identity_public);
            return true;
          })
          .slice(0, RATCHET_PREVIOUS_KEY_RETENTION);
      }

      vault.ratchet_identity_key = ratchet_keys.identity_jwk;
      vault.ratchet_identity_public = ratchet_keys.identity_public;
      vault.ratchet_signed_prekey = ratchet_keys.signed_prekey_jwk;
      vault.ratchet_signed_prekey_public = ratchet_keys.signed_prekey_public;
      vault.ratchet_pq_identity_key = ratchet_keys.pq_identity_secret;
      vault.ratchet_pq_identity_public = ratchet_keys.pq_identity_public;

      await clear_all_ratchet_states();
    }

    await store_vault_in_memory(vault, passphrase);

    const { encrypted_vault, vault_nonce } = await encrypt_vault(
      vault,
      passphrase,
    );

    const roundtrip_ok = await verify_vault_roundtrip(
      encrypted_vault,
      vault_nonce,
      passphrase,
      vault.identity_key,
    );

    if (!roundtrip_ok) return false;

    const pushed = await push_vault_to_server(
      encrypted_vault,
      vault_nonce,
      user_id,
    );

    if (!pushed) return false;

    localStorage.setItem(
      `astermail_encrypted_vault_${user_id}`,
      encrypted_vault,
    );
    localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);

    await upload_prekey_bundle(vault);

    try {
      localStorage.setItem(FORCED_REGEN_KEY, "1");
    } catch {}

    return true;
  } catch {
    return false;
  }
}
