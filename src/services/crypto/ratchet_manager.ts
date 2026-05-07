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

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");

import { api_client } from "../api/client";

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
  derive_ratchet_encryption_key,
} from "./ratchet_sync";
import { get_derived_encryption_key } from "./memory_key_store";

const HASH_ALG = ["SHA", "256"].join("-");

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

export async function upload_prekey_bundle(
  vault: EncryptedVault,
): Promise<boolean> {
  if (!vault.ratchet_identity_public || !vault.ratchet_signed_prekey_public) {
    return false;
  }

  const signature_input = new TextEncoder().encode(
    vault.ratchet_identity_public + vault.ratchet_signed_prekey_public,
  );
  const signature_hash = await crypto.subtle.digest(HASH_ALG, signature_input);
  const signature = array_to_base64(new Uint8Array(signature_hash));

  const response = await api_client.put("/crypto/v1/ratchet/prekey-bundle", {
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: signature,
    one_time_prekeys: [],
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

    if (!ratchet) {
      const bundle = await fetch_prekey_bundle(recipient_username, recipient_email);

      if (!bundle) {
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
      } finally {
        x3dh_result.shared_secret.fill(0);
      }
    }

    const encrypted = await ratchet.encrypt(body);

    await save_ratchet_state(ratchet);

    const sync_key = await get_sync_encryption_key();

    if (sync_key) {
      try {
        await sync_ratchet_to_server(ratchet, sync_key);
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

export async function decrypt_ratchet_message(
  our_email: string,
  sender_email: string,
  envelope: RatchetEnvelope,
  vault: EncryptedVault,
): Promise<string | null> {
  const our_data = envelope.recipients[our_email.toLowerCase()];

  if (!our_data) {
    for (const key of Object.keys(envelope.recipients)) {
      if (key.toLowerCase() === our_email.toLowerCase()) {
        return decrypt_ratchet_for_recipient(
          our_email,
          sender_email,
          envelope.recipients[key],
          envelope.sender_identity_key,
          vault,
        );
      }
    }

    return null;
  }

  return decrypt_ratchet_for_recipient(
    our_email,
    sender_email,
    our_data,
    envelope.sender_identity_key,
    vault,
  );
}

async function decrypt_ratchet_for_recipient(
  our_email: string,
  sender_email: string,
  data: RatchetRecipientData,
  sender_identity_key: string,
  vault: EncryptedVault,
): Promise<string | null> {
  if (
    !vault.ratchet_identity_key ||
    !vault.ratchet_signed_prekey ||
    !vault.ratchet_signed_prekey_public
  ) {
    return null;
  }

  const conversation_id = await derive_conversation_id(our_email, sender_email);

  let ratchet = await load_ratchet_state(conversation_id);

  if (!ratchet) {
    if (!data.ephemeral_key) {
      return null;
    }

    const receiver_identity_jwk: JsonWebKey = JSON.parse(
      vault.ratchet_identity_key,
    );
    const receiver_signed_prekey_jwk: JsonWebKey = JSON.parse(
      vault.ratchet_signed_prekey,
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

    const shared_secret = await perform_x3dh_receiver(
      receiver_identity_jwk,
      receiver_signed_prekey_jwk,
      sender_identity_raw,
      sender_ephemeral_raw,
      pq_input,
    );

    const own_keypair = await jwk_to_ratchet_keypair(
      vault.ratchet_signed_prekey,
      vault.ratchet_signed_prekey_public,
    );

    ratchet = await DoubleRatchet.init_receiver(
      shared_secret,
      own_keypair,
      conversation_id,
    );

    shared_secret.fill(0);
    own_keypair.secret_key.fill(0);
  }

  const message: EncryptedMessage = {
    header: data.header,
    ciphertext: data.ciphertext,
    nonce: data.nonce,
  };

  const plaintext = await ratchet.decrypt(message);

  await save_ratchet_state(ratchet);

  const sync_key = await get_sync_encryption_key();

  if (sync_key) {
    try {
      await sync_ratchet_to_server(ratchet, sync_key);
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
} | null> {
  const identity = await generate_exportable_ke_keypair();
  const signed_prekey = await generate_exportable_ke_keypair();

  return {
    identity_jwk: JSON.stringify(identity.jwk),
    identity_public: array_to_base64(identity.public_key_raw),
    signed_prekey_jwk: JSON.stringify(signed_prekey.jwk),
    signed_prekey_public: array_to_base64(signed_prekey.public_key_raw),
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
