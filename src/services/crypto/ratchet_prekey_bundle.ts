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
import { HASH_ALG } from "@/services/crypto/constants";
import { api_client } from "../api/client";
import { get_recipient_public_key } from "../api/keys";
import { array_to_base64 } from "./base64";
import { type EncryptedVault } from "./key_manager";
import { PINNED_FINGERPRINTS, base64_to_array as core_base64_to_array, compute_hash, pin_fingerprint, verify_pinned_fingerprint } from "./key_manager_core";
import { select_private_key_matching_public, sign_ratchet_prekey_bundle } from "./key_manager_pgp";
import { get_passphrase_from_memory } from "./memory_key_store";
import { type PrekeyBundle } from "./x3dh";

export async function detect_identity_pin_drift(
  pin_id: string,
  kem_identity_key: string,
): Promise<void> {
  try {
    if (!pin_id || !kem_identity_key) {
      return;
    }

    const fingerprint = await compute_hash(
      core_base64_to_array(kem_identity_key),
    );

    const namespaced_pin_id = `ratchet_identity:${pin_id}`;

    if (!PINNED_FINGERPRINTS.has(namespaced_pin_id)) {
      pin_fingerprint(namespaced_pin_id, fingerprint, "identity");

      return;
    }

    const matches = await verify_pinned_fingerprint(namespaced_pin_id, fingerprint);

    if (!matches && import.meta.env.DEV) {
      console.warn(
        `ratchet identity pin drift detected for ${pin_id} (fp ${fingerprint.slice(0, 8)})`,
      );
    }
  } catch {
    /* best-effort detection only */
  }
}

interface RatchetIdentity {
  user_id: string;
  kem_identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  pq_kem_public_key?: string | null;
}

export async function fetch_ratchet_identity(
  username: string,
  email?: string,
): Promise<RatchetIdentity | null> {
  const params = email ? `?email=${encodeURIComponent(email)}` : "";
  const path = `/crypto/v1/ratchet/identity/${encodeURIComponent(username)}${params}`;

  const response = await api_client.get<RatchetIdentity>(path);

  if (response.error || !response.data) {
    return null;
  }

  return response.data;
}

export async function fetch_prekey_bundle(
  username: string,
  email?: string,
): Promise<PrekeyBundle | null> {
  const params = email ? `?email=${encodeURIComponent(email)}` : "";
  const path = `/crypto/v1/ratchet/prekey-bundle/${encodeURIComponent(username)}${params}`;

  let response = await api_client.get<PrekeyBundle>(path);

  if (
    (response.error || !response.data) &&
    response.code !== "NOT_FOUND"
  ) {
    response = await api_client.get<PrekeyBundle>(path);
  }

  if (response.error || !response.data) {
    return null;
  }

  return response.data;
}

interface RatchetIdentityHistoryEntry {
  kem_identity_key: string;
  first_published_at: string;
  last_published_at: string;
}

interface RatchetIdentityHistoryResponse {
  user_id: string;
  entries: RatchetIdentityHistoryEntry[];
  history_complete: boolean;
}

export interface PublishedIdentityHistory {
  identity_keys: string[];
  history_complete: boolean;
}

export async function fetch_published_identity_history(
  username: string,
  email?: string,
): Promise<PublishedIdentityHistory | null> {
  const params = email ? `?email=${encodeURIComponent(email)}` : "";
  const path = `/crypto/v1/ratchet/prekey-bundle/${encodeURIComponent(username)}/history${params}`;

  const response =
    await api_client.get<RatchetIdentityHistoryResponse>(path);

  if (response.error || !response.data) {
    return null;
  }

  const entries = Array.isArray(response.data.entries)
    ? response.data.entries
    : [];

  return {
    identity_keys: entries
      .map((entry) => entry?.kem_identity_key)
      .filter((key): key is string => typeof key === "string" && key.length > 0),
    history_complete: response.data.history_complete === true,
  };
}

async function legacy_prekey_signature(
  identity_public: string,
  signed_prekey_public: string,
): Promise<string> {
  const signature_input = new TextEncoder().encode(
    identity_public + signed_prekey_public,
  );
  const signature_hash = await crypto.subtle.digest(HASH_ALG, signature_input);

  return array_to_base64(new Uint8Array(signature_hash));
}

async function select_bundle_signing_key(
  vault: EncryptedVault,
): Promise<string> {
  const candidates = [vault.identity_key, ...(vault.previous_keys ?? [])];

  if (candidates.filter(Boolean).length <= 1) return vault.identity_key;

  try {
    const { get_current_account } = await import(
      "@/services/account_manager"
    );
    const account = await get_current_account();
    const email = account?.user?.email;

    if (!email) return vault.identity_key;

    const username = email.split("@")[0];
    const response = await get_recipient_public_key(username, email);

    if (!response.data?.public_key) return vault.identity_key;

    const matching = await select_private_key_matching_public(
      candidates,
      response.data.public_key,
    );

    return matching ?? vault.identity_key;
  } catch {
    return vault.identity_key;
  }
}

export async function upload_prekey_bundle(
  vault: EncryptedVault,
): Promise<boolean> {
  if (!vault.ratchet_identity_public || !vault.ratchet_signed_prekey_public) {
    return false;
  }

  const passphrase = get_passphrase_from_memory();
  let signature: string;

  if (vault.identity_key && passphrase) {
    try {
      signature = await sign_ratchet_prekey_bundle(
        await select_bundle_signing_key(vault),
        passphrase,
        vault.ratchet_identity_public,
        vault.ratchet_signed_prekey_public,
        vault.ratchet_pq_identity_public ?? null,
      );
    } catch {
      signature = await legacy_prekey_signature(
        vault.ratchet_identity_public,
        vault.ratchet_signed_prekey_public,
      );
    }
  } else {
    signature = await legacy_prekey_signature(
      vault.ratchet_identity_public,
      vault.ratchet_signed_prekey_public,
    );
  }

  const response = await api_client.put("/crypto/v1/ratchet/prekey-bundle", {
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: signature,
    one_time_prekeys: [],
    pq_kem_public_key: vault.ratchet_pq_identity_public ?? null,
  });

  return !response.error;
}
