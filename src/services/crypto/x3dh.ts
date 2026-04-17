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
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
} from "./key_manager";

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");

const HASH_ALG = ["SHA", "256"].join("-");
const X3DH_INFO = new TextEncoder().encode("Aster Mail_X3DH_v1");
const X3DH_SALT = new Uint8Array(32);

interface X3dhSenderResult {
  shared_secret: Uint8Array;
  ephemeral_public_key: Uint8Array;
}

interface PrekeyBundle {
  kem_identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  one_time_prekey?: string | null;
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function generate_ephemeral_keypair(): Promise<{
  public_key: CryptoKey;
  secret_key: CryptoKey;
  public_key_raw: Uint8Array;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    false,
    ["deriveBits"],
  );

  const public_key_raw = await crypto.subtle.exportKey(
    "raw",
    keypair.publicKey,
  );

  return {
    public_key: keypair.publicKey,
    secret_key: keypair.privateKey,
    public_key_raw: new Uint8Array(public_key_raw),
  };
}

async function kdf_x3dh(dh_outputs: Uint8Array[]): Promise<Uint8Array> {
  let total_length = 0;

  for (const dh of dh_outputs) {
    total_length += dh.length;
  }

  const concatenated = new Uint8Array(total_length);
  let offset = 0;

  for (const dh of dh_outputs) {
    concatenated.set(dh, offset);
    offset += dh.length;
  }

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    concatenated,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: X3DH_SALT,
      info: X3DH_INFO,
    },
    hkdf_key,
    256,
  );

  concatenated.fill(0);

  return new Uint8Array(derived);
}

export async function perform_x3dh_sender(
  sender_identity_jwk: JsonWebKey,
  recipient_bundle: PrekeyBundle,
): Promise<X3dhSenderResult> {
  const sender_identity_private =
    await import_ke_private_key(sender_identity_jwk);

  const recipient_identity_raw = base64_to_array(
    recipient_bundle.kem_identity_key,
  );
  const recipient_signed_prekey_raw = base64_to_array(
    recipient_bundle.signed_prekey,
  );

  const recipient_identity_public = await import_ke_public_key(
    recipient_identity_raw,
  );
  const recipient_signed_prekey_public = await import_ke_public_key(
    recipient_signed_prekey_raw,
  );

  const ephemeral = await generate_ephemeral_keypair();

  const dh1 = await compute_agreement_bits(
    sender_identity_private,
    recipient_signed_prekey_public,
  );

  const dh2 = await compute_agreement_bits(
    ephemeral.secret_key,
    recipient_identity_public,
  );

  const dh3 = await compute_agreement_bits(
    ephemeral.secret_key,
    recipient_signed_prekey_public,
  );

  const shared_secret = await kdf_x3dh([dh1, dh2, dh3]);

  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);

  return {
    shared_secret,
    ephemeral_public_key: ephemeral.public_key_raw,
  };
}

export async function perform_x3dh_receiver(
  receiver_identity_jwk: JsonWebKey,
  receiver_signed_prekey_jwk: JsonWebKey,
  sender_identity_raw: Uint8Array,
  sender_ephemeral_raw: Uint8Array,
): Promise<Uint8Array> {
  const receiver_identity_private = await import_ke_private_key(
    receiver_identity_jwk,
  );
  const receiver_signed_prekey_private = await import_ke_private_key(
    receiver_signed_prekey_jwk,
  );

  const sender_identity_public =
    await import_ke_public_key(sender_identity_raw);
  const sender_ephemeral_public =
    await import_ke_public_key(sender_ephemeral_raw);

  const dh1 = await compute_agreement_bits(
    receiver_signed_prekey_private,
    sender_identity_public,
  );

  const dh2 = await compute_agreement_bits(
    receiver_identity_private,
    sender_ephemeral_public,
  );

  const dh3 = await compute_agreement_bits(
    receiver_signed_prekey_private,
    sender_ephemeral_public,
  );

  const shared_secret = await kdf_x3dh([dh1, dh2, dh3]);

  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);

  return shared_secret;
}

export type { PrekeyBundle, X3dhSenderResult };
