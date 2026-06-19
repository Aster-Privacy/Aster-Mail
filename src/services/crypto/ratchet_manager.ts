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
import type { EncryptedVault } from "./key_manager";
import type { RatchetKeySet } from "./key_manager_core";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");

import { api_client } from "../api/client";
import { get_recipient_public_key } from "../api/keys";

import {
  DoubleRatchet,
  save_ratchet_state,
  load_ratchet_state,
  type EncryptedMessage,
  type RatchetKeyPair,
} from "./double_ratchet";
import {
  perform_x3dh_sender,
  perform_x3dh_receiver,
  type PrekeyBundle,
} from "./x3dh";
import {
  sync_ratchet_to_server,
  load_ratchet_from_server,
  derive_ratchet_encryption_key,
} from "./ratchet_sync";
import {
  get_derived_encryption_key,
  get_passphrase_from_memory,
} from "./memory_key_store";
import {
  sign_ratchet_prekey_bundle,
  verify_ratchet_prekey_bundle,
} from "./key_manager_pgp";
import {
  get_cached_ratchet_plaintext,
  set_cached_ratchet_plaintext,
} from "./ratchet_plaintext_cache";
import {
  upload_to_escrow,
  fetch_from_escrow,
} from "./message_escrow";
import {
  base64_to_array as core_base64_to_array,
  compute_hash,
  pin_fingerprint,
  verify_pinned_fingerprint,
  PINNED_FINGERPRINTS,
} from "./key_manager_core";

const HASH_ALG = ["SHA", "256"].join("-");

async function detect_identity_pin_drift(
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

interface RatchetRecipientData {
  ephemeral_key: string;
  header: {
    dh_public: string;
    previous_chain_length: number;
    message_number: number;
  };
  ciphertext: string;
  nonce: string;
  pq_ciphertext?: string;
  pq_key_id?: number;
}

interface RatchetEnvelope {
  type: "double_ratchet_v1" | "double_ratchet_v2";
  sender_identity_key: string;
  recipients: Record<string, RatchetRecipientData>;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function jwk_d_to_bytes(jwk: JsonWebKey): Uint8Array {
  const d_base64url = jwk.d!;
  const d_base64 = d_base64url.replace(/-/g, "+").replace(/_/g, "/");

  return base64_to_array(d_base64);
}

async function jwk_to_ratchet_keypair(
  jwk_string: string,
  public_key_base64: string,
): Promise<RatchetKeyPair> {
  const jwk: JsonWebKey = JSON.parse(jwk_string);

  return {
    public_key: base64_to_array(public_key_base64),
    secret_key: jwk_d_to_bytes(jwk),
  };
}

export async function derive_conversation_id(
  email_a: string,
  email_b: string,
): Promise<string> {
  const sorted = [email_a.toLowerCase(), email_b.toLowerCase()].sort();
  const input = new TextEncoder().encode(sorted.join(":"));
  const hash = await crypto.subtle.digest(HASH_ALG, input);

  return array_to_base64(new Uint8Array(hash));
}

async function fetch_prekey_bundle(
  username: string,
  email?: string,
): Promise<PrekeyBundle | null> {
  const params = email ? `?email=${encodeURIComponent(email)}` : "";
  const response = await api_client.get<PrekeyBundle>(
    `/crypto/v1/ratchet/prekey-bundle/${encodeURIComponent(username)}${params}`,
  );

  if (response.error || !response.data) {
    return null;
  }

  return response.data;
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
        vault.identity_key,
        passphrase,
        vault.ratchet_identity_public,
        vault.ratchet_signed_prekey_public,
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

async function get_sync_encryption_key(): Promise<CryptoKey | null> {
  const master_key = get_derived_encryption_key();

  if (!master_key) return null;

  const key = await derive_ratchet_encryption_key(master_key);

  master_key.fill(0);

  return key;
}

export async function encrypt_for_ratchet_recipient(
  sender_email: string,
  recipient_email: string,
  recipient_username: string,
  body: string,
  vault: EncryptedVault,
): Promise<RatchetRecipientData | null> {
  try {
    if (!vault.ratchet_identity_key || !vault.ratchet_identity_public) {
      return null;
    }

    const conversation_id = await derive_conversation_id(
      sender_email,
      recipient_email,
    );

    let ratchet = await load_ratchet_state(conversation_id);

    let ephemeral_key_base64 = "";
    let pq_ciphertext_base64: string | undefined;
    let pq_key_id_value: number | undefined;

    let bundle: PrekeyBundle | null = null;

    if (ratchet) {
      const bootstrap = ratchet.get_bootstrap();

      const sender_changed =
        !bootstrap ||
        bootstrap.sender_identity_key !== vault.ratchet_identity_public;

      let recipient_changed = false;

      if (!sender_changed) {
        bundle = await fetch_prekey_bundle(recipient_username, recipient_email);

        if (bundle && bootstrap?.recipient_identity_key !== bundle.kem_identity_key) {
          recipient_changed = true;
        }
      }

      if (sender_changed || recipient_changed) {
        ratchet = null;
      }
    }

    if (!ratchet) {
      if (!bundle) {
        bundle = await fetch_prekey_bundle(recipient_username, recipient_email);
      }

      if (!bundle) {
        return null;
      }

      await detect_identity_pin_drift(
        (recipient_email ?? recipient_username).toLowerCase(),
        bundle.kem_identity_key,
      );

      const owner_key = await get_recipient_public_key(
        recipient_username,
        recipient_email,
      );
      const bundle_verdict = await verify_ratchet_prekey_bundle(
        bundle.signed_prekey_signature,
        bundle.kem_identity_key,
        bundle.signed_prekey,
        owner_key.data?.public_key ?? null,
      );

      if (bundle_verdict === "tampered") {
        if (import.meta.env.DEV) {
          console.warn(
            "ratchet prekey bundle signature failed verification; routing via PGP",
          );
        }

        return null;
      }

      const sender_identity_jwk: JsonWebKey = JSON.parse(
        vault.ratchet_identity_key,
      );

      const x3dh_result = await perform_x3dh_sender(
        sender_identity_jwk,
        bundle,
      );

      try {
        const recipient_signed_prekey_raw = base64_to_array(
          bundle.signed_prekey,
        );

        ratchet = await DoubleRatchet.init_sender(
          x3dh_result.shared_secret,
          recipient_signed_prekey_raw,
          conversation_id,
        );

        ephemeral_key_base64 = array_to_base64(
          x3dh_result.ephemeral_public_key,
        );

        if (x3dh_result.pq_ciphertext && x3dh_result.pq_key_id !== undefined) {
          pq_ciphertext_base64 = array_to_base64(x3dh_result.pq_ciphertext);
          pq_key_id_value = x3dh_result.pq_key_id;
        }

        ratchet.set_bootstrap({
          ephemeral_key: ephemeral_key_base64,
          pq_ciphertext: pq_ciphertext_base64,
          pq_key_id: pq_key_id_value,
          sender_identity_key: vault.ratchet_identity_public,
          recipient_identity_key: bundle.kem_identity_key,
        });
      } finally {
        x3dh_result.shared_secret.fill(0);
      }
    } else {
      const bootstrap = ratchet.get_bootstrap();

      if (bootstrap) {
        ephemeral_key_base64 = bootstrap.ephemeral_key;
        pq_ciphertext_base64 = bootstrap.pq_ciphertext;
        pq_key_id_value = bootstrap.pq_key_id;
      }
    }

    const encrypted = await ratchet.encrypt(body);

    await save_ratchet_state(ratchet);

    const sync_key_send = await get_sync_encryption_key();

    if (sync_key_send) {
      try {
        await sync_ratchet_to_server(ratchet, sync_key_send);
      } catch {
        /* best-effort */
      }
    }

    const recipient_data: RatchetRecipientData = {
      ephemeral_key: ephemeral_key_base64,
      header: encrypted.header,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
    };

    if (pq_ciphertext_base64 && pq_key_id_value !== undefined) {
      recipient_data.pq_ciphertext = pq_ciphertext_base64;
      recipient_data.pq_key_id = pq_key_id_value;
    }

    return recipient_data;
  } catch {
    return null;
  }
}

export function build_ratchet_envelope(
  sender_identity_public: string,
  recipients: Record<string, RatchetRecipientData>,
): string {
  const envelope: RatchetEnvelope = {
    type: "double_ratchet_v2",
    sender_identity_key: sender_identity_public,
    recipients,
  };

  return JSON.stringify(envelope);
}

export function parse_ratchet_envelope(body: string): RatchetEnvelope | null {
  if (!body.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(body);

    if (
      parsed.type !== "double_ratchet_v1" &&
      parsed.type !== "double_ratchet_v2"
    ) {
      return null;
    }
    if (!parsed.sender_identity_key || !parsed.recipients) return null;

    return parsed as RatchetEnvelope;
  } catch {
    return null;
  }
}

function resolve_recipient_data(
  our_email: string,
  envelope: RatchetEnvelope,
): RatchetRecipientData | null {
  const direct = envelope.recipients[our_email.toLowerCase()];

  if (direct) return direct;

  for (const key of Object.keys(envelope.recipients)) {
    if (key.toLowerCase() === our_email.toLowerCase()) {
      return envelope.recipients[key];
    }
  }

  return null;
}

function build_dedupe_key(
  message_id: string,
  data: RatchetRecipientData | null,
): string {
  if (!data) return message_id;

  return `${message_id}:${data.header.dh_public}:${data.header.message_number}`;
}

export async function decrypt_ratchet_message(
  our_email: string,
  sender_email: string,
  envelope: RatchetEnvelope,
  vault: EncryptedVault,
  message_id?: string,
): Promise<string | null> {
  const our_data = resolve_recipient_data(our_email, envelope);
  const dedupe_key = message_id
    ? build_dedupe_key(message_id, our_data)
    : undefined;

  if (dedupe_key) {
    const cached = await get_cached_ratchet_plaintext(dedupe_key);

    if (cached !== null) return cached;
  }

  let plaintext: string | null = null;

  if (our_data) {
    plaintext = await decrypt_ratchet_for_recipient(
      our_email,
      sender_email,
      our_data,
      envelope.sender_identity_key,
      vault,
    );
  }

  if (plaintext !== null) {
    void detect_identity_pin_drift(
      sender_email.toLowerCase(),
      envelope.sender_identity_key,
    );

    if (dedupe_key) {
      await set_cached_ratchet_plaintext(dedupe_key, plaintext);
      void upload_to_escrow(dedupe_key, plaintext).catch(() => {});
    }

    return plaintext;
  }

  if (dedupe_key) {
    const escrowed = await fetch_from_escrow(dedupe_key).catch(() => null);

    if (escrowed !== null) return escrowed;
  }

  return null;
}

function receiver_key_sets(vault: EncryptedVault): RatchetKeySet[] {
  const sets: RatchetKeySet[] = [];

  if (
    vault.ratchet_identity_key &&
    vault.ratchet_identity_public &&
    vault.ratchet_signed_prekey &&
    vault.ratchet_signed_prekey_public
  ) {
    sets.push({
      ratchet_identity_key: vault.ratchet_identity_key,
      ratchet_identity_public: vault.ratchet_identity_public,
      ratchet_signed_prekey: vault.ratchet_signed_prekey,
      ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public,
    });
  }

  for (const previous of vault.ratchet_previous_keys ?? []) {
    if (
      previous.ratchet_identity_key &&
      previous.ratchet_identity_public &&
      previous.ratchet_signed_prekey &&
      previous.ratchet_signed_prekey_public
    ) {
      sets.push(previous);
    }
  }

  return sets;
}

async function init_receiver_from_bootstrap(
  data: RatchetRecipientData,
  sender_identity_key: string,
  keys: RatchetKeySet,
  conversation_id: string,
): Promise<DoubleRatchet | null> {
  if (
    !keys.ratchet_identity_key ||
    !keys.ratchet_signed_prekey ||
    !keys.ratchet_signed_prekey_public ||
    !data.ephemeral_key
  ) {
    return null;
  }

  const receiver_identity_jwk: JsonWebKey = JSON.parse(
    keys.ratchet_identity_key,
  );
  const receiver_signed_prekey_jwk: JsonWebKey = JSON.parse(
    keys.ratchet_signed_prekey,
  );

  const sender_identity_raw = base64_to_array(sender_identity_key);
  const sender_ephemeral_raw = base64_to_array(data.ephemeral_key);

  const pq_input =
    data.pq_ciphertext && data.pq_key_id !== undefined
      ? {
          pq_ciphertext: base64_to_array(data.pq_ciphertext),
          pq_key_id: data.pq_key_id,
        }
      : null;

  if (!pq_input && keys.ratchet_pq_identity_public) {
    if (import.meta.env.DEV) {
      console.warn(
        "ratchet receiver: PQ-capable identity received a non-PQ bootstrap, proceeding classically",
      );
    }
  }

  const shared_secret = await perform_x3dh_receiver(
    receiver_identity_jwk,
    receiver_signed_prekey_jwk,
    sender_identity_raw,
    sender_ephemeral_raw,
    pq_input,
  );

  const own_keypair = await jwk_to_ratchet_keypair(
    keys.ratchet_signed_prekey,
    keys.ratchet_signed_prekey_public,
  );

  const ratchet = await DoubleRatchet.init_receiver(
    shared_secret,
    own_keypair,
    conversation_id,
  );

  shared_secret.fill(0);
  own_keypair.secret_key.fill(0);

  return ratchet;
}

async function decrypt_ratchet_for_recipient(
  our_email: string,
  sender_email: string,
  data: RatchetRecipientData,
  sender_identity_key: string,
  vault: EncryptedVault,
): Promise<string | null> {
  const key_sets = receiver_key_sets(vault);

  if (key_sets.length === 0) {
    return null;
  }

  const conversation_id = await derive_conversation_id(our_email, sender_email);

  const is_fresh_bootstrap =
    !!data.ephemeral_key &&
    data.header.message_number === 0 &&
    data.header.previous_chain_length === 0;

  const message: EncryptedMessage = {
    header: data.header,
    ciphertext: data.ciphertext,
    nonce: data.nonce,
  };

  let ratchet = await load_ratchet_state(conversation_id);

  if (ratchet && is_fresh_bootstrap) {
    ratchet = null;
  }

  let plaintext: string | null = null;

  if (ratchet) {
    try {
      plaintext = await ratchet.decrypt(message);
    } catch {
      plaintext = null;
    }
  }

  if (plaintext === null) {
    let last_error: unknown = null;

    for (const keys of key_sets) {
      let candidate: DoubleRatchet | null = null;

      try {
        candidate = await init_receiver_from_bootstrap(
          data,
          sender_identity_key,
          keys,
          conversation_id,
        );
      } catch (err) {
        last_error = err;
        continue;
      }

      if (!candidate) {
        continue;
      }

      try {
        plaintext = await candidate.decrypt(message);
        ratchet = candidate;
        break;
      } catch (err) {
        last_error = err;
      }
    }

    if (plaintext === null || !ratchet) {
      const server_sync_key = await get_sync_encryption_key();

      if (server_sync_key) {
        try {
          const server_state = await load_ratchet_from_server(
            conversation_id,
            server_sync_key,
          );

          if (server_state) {
            try {
              plaintext = await server_state.ratchet.decrypt(message);
              ratchet = server_state.ratchet;
            } catch {
              /* server state also cannot decrypt */
            }
          }
        } catch {
          /* best-effort */
        }
      }
    }

    if (plaintext === null || !ratchet) {
      if (last_error) {
        throw last_error;
      }

      return null;
    }
  }

  if (!ratchet) {
    return null;
  }

  await save_ratchet_state(ratchet);

  const sync_key_recv = await get_sync_encryption_key();

  if (sync_key_recv) {
    try {
      await sync_ratchet_to_server(ratchet, sync_key_recv);
    } catch {
      /* best-effort */
    }
  }

  return plaintext;
}

export async function generate_ratchet_keys(): Promise<{
  identity_jwk: string;
  identity_public: string;
  signed_prekey_jwk: string;
  signed_prekey_public: string;
  pq_identity_secret: string;
  pq_identity_public: string;
} | null> {
  const identity = await generate_exportable_ke_keypair();
  const signed_prekey = await generate_exportable_ke_keypair();
  const pq_seed = crypto.getRandomValues(new Uint8Array(64));
  const pq_keys = ml_kem768.keygen(pq_seed);

  return {
    identity_jwk: JSON.stringify(identity.jwk),
    identity_public: array_to_base64(identity.public_key_raw),
    signed_prekey_jwk: JSON.stringify(signed_prekey.jwk),
    signed_prekey_public: array_to_base64(signed_prekey.public_key_raw),
    pq_identity_secret: array_to_base64(pq_keys.secretKey),
    pq_identity_public: array_to_base64(pq_keys.publicKey),
  };
}

export async function generate_pq_identity_keys(): Promise<{
  pq_identity_secret: string;
  pq_identity_public: string;
}> {
  const pq_seed = crypto.getRandomValues(new Uint8Array(64));
  const pq_keys = ml_kem768.keygen(pq_seed);

  return {
    pq_identity_secret: array_to_base64(pq_keys.secretKey),
    pq_identity_public: array_to_base64(pq_keys.publicKey),
  };
}

async function generate_exportable_ke_keypair(): Promise<{
  jwk: JsonWebKey;
  public_key_raw: Uint8Array;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    true,
    ["deriveBits"],
  );

  const public_key_raw = await crypto.subtle.exportKey(
    "raw",
    keypair.publicKey,
  );

  const jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);

  return {
    jwk,
    public_key_raw: new Uint8Array(public_key_raw),
  };
}

export type { RatchetEnvelope, RatchetRecipientData };
