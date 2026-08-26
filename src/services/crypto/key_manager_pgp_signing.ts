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
import * as openpgp from "openpgp";

import { array_to_base64, base64_to_array } from "./key_manager_core";

export async function verify_prekey_signature(
  prekey_public: string,
  signature: string,
  identity_public_key: string,
): Promise<boolean> {
  try {
    const identity_key = await openpgp.readKey({
      armoredKey: identity_public_key,
    });
    const signed_message = await openpgp.readCleartextMessage({
      cleartextMessage: signature,
    });

    const verification = await openpgp.verify({
      message: signed_message,
      verificationKeys: identity_key,
    });

    let any_valid = false;

    for (const signature of verification.signatures) {
      try {
        await signature.verified;
        any_valid = true;
        break;
      } catch {
        continue;
      }
    }

    if (!any_valid) {
      return false;
    }

    const extracted_text = signed_message.getText();

    if (extracted_text !== prekey_public) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function verify_key_binding(
  identity_public_key: string,
  signed_prekey_public: string,
  prekey_signature: string,
): Promise<{
  valid: boolean;
  identity_fingerprint: string;
  prekey_fingerprint: string;
}> {
  const identity_key = await openpgp.readKey({
    armoredKey: identity_public_key,
  });
  const identity_fingerprint = identity_key.getFingerprint();

  const prekey = await openpgp.readKey({ armoredKey: signed_prekey_public });
  const prekey_fingerprint = prekey.getFingerprint();

  const signature_valid = await verify_prekey_signature(
    signed_prekey_public,
    prekey_signature,
    identity_public_key,
  );

  return {
    valid: signature_valid,
    identity_fingerprint,
    prekey_fingerprint,
  };
}

const RATCHET_PREKEY_SIG_PREFIX = "aster-ratchet-prekey-v1:";
const RATCHET_PREKEY_SIG_PREFIX_V2 = "aster-ratchet-prekey-v2:";
const PGP_CLEARTEXT_HEADER = "-----BEGIN PGP SIGNED MESSAGE-----";

function build_ratchet_prekey_canonical(
  kem_identity_key: string,
  signed_prekey: string,
): string {
  return `${RATCHET_PREKEY_SIG_PREFIX}${kem_identity_key}.${signed_prekey}`;
}

function build_ratchet_prekey_canonical_v2(
  kem_identity_key: string,
  signed_prekey: string,
  pq_identity_key: string,
): string {
  return `${RATCHET_PREKEY_SIG_PREFIX_V2}${kem_identity_key}.${signed_prekey}.${pq_identity_key}`;
}

/*
 * Produce a real OpenPGP cleartext signature binding the ratchet identity key
 * and signed prekey to the user's long-term PGP identity key. The armored
 * signature is base64-wrapped so it survives the prekey-bundle endpoint, which
 * stores the field as opaque bytes. Throws on failure; the caller falls back to
 * the legacy hash binding so prekey upload never breaks.
 */
export async function sign_ratchet_prekey_bundle(
  identity_secret_key: string,
  passphrase: string,
  kem_identity_key: string,
  signed_prekey: string,
  pq_identity_key?: string | null,
): Promise<string> {
  const identity_key = await openpgp.decryptKey({
    ["privateKey" as const]: await openpgp.readPrivateKey({
      armoredKey: identity_secret_key,
    }),
    passphrase,
  });

  const text = pq_identity_key
    ? build_ratchet_prekey_canonical_v2(
        kem_identity_key,
        signed_prekey,
        pq_identity_key,
      )
    : build_ratchet_prekey_canonical(kem_identity_key, signed_prekey);
  const message = await openpgp.createCleartextMessage({ text });
  const signed = await openpgp.sign({
    message,
    signingKeys: identity_key,
    format: "armored",
  });

  const armored = String(signed);

  return array_to_base64(new TextEncoder().encode(armored));
}

export type RatchetPrekeyVerdict =
  | "verified"
  | "tampered"
  | "legacy"
  | "unknown";

export type RatchetPrekeySignatureFormat = "v2" | "v1" | "hash" | "unreadable";

export interface RatchetPrekeyVerification {
  verdict: RatchetPrekeyVerdict;
  format: RatchetPrekeySignatureFormat;
  strict: boolean;
}

function classify_signed_text(
  signed_text: string,
): Exclude<RatchetPrekeySignatureFormat, "hash"> {
  if (signed_text.startsWith(RATCHET_PREKEY_SIG_PREFIX_V2)) return "v2";

  if (signed_text.startsWith(RATCHET_PREKEY_SIG_PREFIX)) return "v1";

  return "unreadable";
}

export async function read_ratchet_prekey_signature_format(
  signature_field: string,
): Promise<RatchetPrekeySignatureFormat> {
  let armored: string;

  try {
    armored = new TextDecoder().decode(base64_to_array(signature_field));
  } catch {
    return "unreadable";
  }

  if (!armored.startsWith(PGP_CLEARTEXT_HEADER)) {
    return "hash";
  }

  try {
    const cleartext = await openpgp.readCleartextMessage({
      cleartextMessage: armored,
    });

    return classify_signed_text(cleartext.getText());
  } catch {
    return "unreadable";
  }
}

export async function verify_ratchet_prekey_bundle_detailed(
  signature_field: string,
  kem_identity_key: string,
  signed_prekey: string,
  owner_pgp_public_key: string | null,
  pq_identity_key?: string | null,
): Promise<RatchetPrekeyVerification> {
  let armored: string;

  try {
    armored = new TextDecoder().decode(base64_to_array(signature_field));
  } catch {
    return { verdict: "unknown", format: "unreadable", strict: false };
  }

  if (!armored.startsWith(PGP_CLEARTEXT_HEADER)) {
    return { verdict: "legacy", format: "hash", strict: false };
  }

  let signed_text: string;

  try {
    const cleartext = await openpgp.readCleartextMessage({
      cleartextMessage: armored,
    });

    signed_text = cleartext.getText();
  } catch {
    return { verdict: "tampered", format: "unreadable", strict: false };
  }

  const format = classify_signed_text(signed_text);

  if (format === "unreadable") {
    return { verdict: "tampered", format, strict: false };
  }

  if (!owner_pgp_public_key) {
    return { verdict: "unknown", format, strict: false };
  }

  const expected_text =
    format === "v2"
      ? build_ratchet_prekey_canonical_v2(
          kem_identity_key,
          signed_prekey,
          pq_identity_key ?? "",
        )
      : build_ratchet_prekey_canonical(kem_identity_key, signed_prekey);

  let signature_valid = false;

  try {
    signature_valid = await verify_prekey_signature(
      expected_text,
      armored,
      owner_pgp_public_key,
    );
  } catch {
    return { verdict: "tampered", format, strict: false };
  }

  if (!signature_valid) {
    return { verdict: "tampered", format, strict: false };
  }

  return { verdict: "verified", format, strict: format === "v2" };
}

export async function verify_ratchet_prekey_bundle(
  signature_field: string,
  kem_identity_key: string,
  signed_prekey: string,
  owner_pgp_public_key: string | null,
  pq_identity_key?: string | null,
): Promise<RatchetPrekeyVerdict> {
  const verification = await verify_ratchet_prekey_bundle_detailed(
    signature_field,
    kem_identity_key,
    signed_prekey,
    owner_pgp_public_key,
    pq_identity_key,
  );

  return verification.verdict;
}
