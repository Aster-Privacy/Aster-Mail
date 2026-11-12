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

import { p256 } from "@noble/curves/nist";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import {
  ADDRESS_SIGNED_PREKEY_SALT,
  base64url_decode,
  derive_address_key,
  normalize_identity_address,
} from "./address_sender_identity";
import { array_to_base64, base64_to_array } from "./base64";
import { type RatchetKeySet } from "./key_manager_core";
import { resolve_pq_identity_secret } from "./ratchet_keys";

const ADDRESS_PQ_IDENTITY_SALT = new TextEncoder().encode(
  "aster/ratchet/address-pq-identity/v1",
);
const ENTRY_LABEL = "aster/ratchet/address-entry/v1";
const ENDORSEMENT_LABEL = "aster/ratchet/address-endorsement/v1";
const PQ_SEED_LEN = 64;
const POINT_LEN = 65;
const SIGNATURE_LEN = 64;
const ENDORSEMENT_LEN = POINT_LEN + SIGNATURE_LEN;
const KEY_SET_CACHE_LIMIT = 512;

export const MAX_ENTRY_ENDORSEMENTS = 32;

export interface AddressEntryKeys {
  kem_identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  pq_kem_public_key?: string | null;
}

export interface SignedAddressEntry extends AddressEntryKeys {
  address: string;
}

export interface AddressEntryVerification {
  valid: boolean;
  endorsers: string[];
}

const key_set_cache = new Map<string, RatchetKeySet | null>();

export function clear_address_key_set_cache(): void {
  key_set_cache.clear();
}

export function canonical_address_form(address: string): string {
  const normalized = normalize_identity_address(address);
  const at = normalized.lastIndexOf("@");

  if (at <= 0 || at === normalized.length - 1) return "";

  const local = normalized.slice(0, at).split("+")[0].replace(/\./g, "");

  if (!local) return "";

  return `${local}@${normalized.slice(at + 1)}`;
}

export function address_entry_forms(address: string): string[] {
  const normalized = normalize_identity_address(address);
  const canonical = canonical_address_form(normalized);

  if (!canonical) return [];

  return normalized === canonical ? [normalized] : [normalized, canonical];
}

function account_key_set(vault: EncryptedVault): RatchetKeySet | null {
  if (
    !vault.ratchet_identity_key ||
    !vault.ratchet_identity_public ||
    !vault.ratchet_signed_prekey ||
    !vault.ratchet_signed_prekey_public
  ) {
    return null;
  }

  return {
    ratchet_identity_key: vault.ratchet_identity_key,
    ratchet_identity_public: vault.ratchet_identity_public,
    ratchet_signed_prekey: vault.ratchet_signed_prekey,
    ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public,
    ratchet_pq_identity_key: vault.ratchet_pq_identity_key,
    ratchet_pq_identity_public: vault.ratchet_pq_identity_public,
    ratchet_pq_identity_seed: vault.ratchet_pq_identity_seed,
  };
}

function derive_pq_identity(
  source: RatchetKeySet,
  form: string,
): { secret: string; public_key: string } | null {
  const account_secret = resolve_pq_identity_secret(
    source.ratchet_pq_identity_key,
    source.ratchet_pq_identity_seed,
  );

  if (!account_secret) return null;

  let secret_bytes: Uint8Array | null = null;
  let seed: Uint8Array | null = null;

  try {
    secret_bytes = base64_to_array(account_secret);
    seed = hkdf(
      sha256,
      secret_bytes,
      ADDRESS_PQ_IDENTITY_SALT,
      new TextEncoder().encode(form),
      PQ_SEED_LEN,
    );

    const keys = ml_kem768.keygen(seed);

    return {
      secret: array_to_base64(keys.secretKey),
      public_key: array_to_base64(keys.publicKey),
    };
  } catch {
    return null;
  } finally {
    secret_bytes?.fill(0);
    seed?.fill(0);
  }
}

export function derive_address_key_set(
  source: RatchetKeySet,
  address_form: string,
): RatchetKeySet | null {
  const form = normalize_identity_address(address_form);

  if (!form) return null;

  const cache_key = [
    source.ratchet_identity_public,
    source.ratchet_signed_prekey_public,
    source.ratchet_pq_identity_public ?? "",
    form,
  ].join("|");

  if (key_set_cache.has(cache_key)) {
    return key_set_cache.get(cache_key) ?? null;
  }

  const identity = derive_address_key(source.ratchet_identity_key, form);
  const signed_prekey = derive_address_key(
    source.ratchet_signed_prekey,
    form,
    ADDRESS_SIGNED_PREKEY_SALT,
  );
  const pq_identity = derive_pq_identity(source, form);

  const derived: RatchetKeySet | null =
    identity && signed_prekey
      ? {
          ratchet_identity_key: identity.identity_jwk,
          ratchet_identity_public: identity.identity_public,
          ratchet_signed_prekey: signed_prekey.identity_jwk,
          ratchet_signed_prekey_public: signed_prekey.identity_public,
          ...(pq_identity
            ? {
                ratchet_pq_identity_key: pq_identity.secret,
                ratchet_pq_identity_public: pq_identity.public_key,
              }
            : {}),
        }
      : null;

  if (key_set_cache.size >= KEY_SET_CACHE_LIMIT) key_set_cache.clear();

  key_set_cache.set(cache_key, derived);

  return derived;
}

export function address_receiver_key_sets(
  vault: EncryptedVault,
  address: string,
): RatchetKeySet[] {
  const forms = address_entry_forms(address);

  if (forms.length === 0) return [];

  const current = account_key_set(vault);
  const sources: RatchetKeySet[] = [
    ...(current ? [current] : []),
    ...(vault.ratchet_previous_keys ?? []).filter(
      (previous) =>
        previous.ratchet_identity_key &&
        previous.ratchet_identity_public &&
        previous.ratchet_signed_prekey &&
        previous.ratchet_signed_prekey_public,
    ),
  ];
  const sets: RatchetKeySet[] = [];

  for (const source of sources) {
    for (const form of forms) {
      const derived = derive_address_key_set(source, form);

      if (derived) sets.push(derived);
    }
  }

  return sets;
}

function length_prefixed(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + 4 + part.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;

  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    out.set(part, offset + 4);
    offset += 4 + part.length;
  }

  return out;
}

function entry_digest(
  label: string,
  form: string,
  keys: {
    kem_identity_key: string;
    signed_prekey: string;
    pq_kem_public_key?: string | null;
  },
): Uint8Array {
  const encoder = new TextEncoder();

  return sha256(
    length_prefixed([
      encoder.encode(label),
      encoder.encode(form),
      base64_to_array(keys.kem_identity_key),
      base64_to_array(keys.signed_prekey),
      keys.pq_kem_public_key
        ? base64_to_array(keys.pq_kem_public_key)
        : new Uint8Array(0),
    ]),
  );
}

function sign_digest(digest: Uint8Array, identity_jwk: string): Uint8Array {
  let scalar: Uint8Array | null = null;

  try {
    const jwk: JsonWebKey = JSON.parse(identity_jwk);

    scalar = base64url_decode(jwk.d ?? "");

    return p256.sign(digest, scalar, { lowS: true }).toCompactRawBytes();
  } finally {
    scalar?.fill(0);
  }
}

function verify_digest(
  digest: Uint8Array,
  signature: Uint8Array,
  public_key: Uint8Array,
): boolean {
  try {
    return p256.verify(
      signature,
      digest,
      public_key,
      { lowS: false },
    );
  } catch {
    return false;
  }
}

export function sign_address_entry(
  vault: EncryptedVault,
  address_form: string,
): SignedAddressEntry | null {
  const form = normalize_identity_address(address_form);
  const current = account_key_set(vault);

  if (!form || !current) return null;

  try {
    const derived = derive_address_key_set(current, form);

    if (!derived) return null;

    const keys = {
      kem_identity_key: derived.ratchet_identity_public,
      signed_prekey: derived.ratchet_signed_prekey_public,
      pq_kem_public_key: derived.ratchet_pq_identity_public ?? null,
    };
    const parts: Uint8Array[] = [
      sign_digest(
        entry_digest(ENTRY_LABEL, form, keys),
        derived.ratchet_identity_key,
      ),
    ];
    const endorsement_digest = entry_digest(ENDORSEMENT_LABEL, form, keys);
    const seen = new Set<string>([derived.ratchet_identity_public]);

    for (const previous of vault.ratchet_previous_keys ?? []) {
      if (parts.length > MAX_ENTRY_ENDORSEMENTS) break;

      const earlier = derive_address_key(previous.ratchet_identity_key, form);

      if (!earlier || seen.has(earlier.identity_public)) continue;

      seen.add(earlier.identity_public);

      const endorsement = new Uint8Array(ENDORSEMENT_LEN);

      endorsement.set(base64_to_array(earlier.identity_public), 0);
      endorsement.set(
        sign_digest(endorsement_digest, earlier.identity_jwk),
        POINT_LEN,
      );
      parts.push(endorsement);
    }

    const signature = new Uint8Array(
      parts.reduce((sum, part) => sum + part.length, 0),
    );
    let offset = 0;

    for (const part of parts) {
      signature.set(part, offset);
      offset += part.length;
    }

    return {
      address: form,
      ...keys,
      signed_prekey_signature: array_to_base64(signature),
    };
  } catch {
    return null;
  }
}

function verify_entry_for_form(
  form: string,
  entry: AddressEntryKeys,
): AddressEntryVerification | null {
  const signature = base64_to_array(entry.signed_prekey_signature);
  const identity = base64_to_array(entry.kem_identity_key);

  if (
    identity.length !== POINT_LEN ||
    signature.length < SIGNATURE_LEN ||
    (signature.length - SIGNATURE_LEN) % ENDORSEMENT_LEN !== 0
  ) {
    return null;
  }

  if (
    !verify_digest(
      entry_digest(ENTRY_LABEL, form, entry),
      signature.subarray(0, SIGNATURE_LEN),
      identity,
    )
  ) {
    return null;
  }

  const endorsement_digest = entry_digest(ENDORSEMENT_LABEL, form, entry);
  const endorsers: string[] = [];

  for (
    let offset = SIGNATURE_LEN;
    offset < signature.length &&
    endorsers.length < MAX_ENTRY_ENDORSEMENTS;
    offset += ENDORSEMENT_LEN
  ) {
    const endorser = signature.subarray(offset, offset + POINT_LEN);
    const endorsement = signature.subarray(
      offset + POINT_LEN,
      offset + ENDORSEMENT_LEN,
    );

    if (verify_digest(endorsement_digest, endorsement, endorser)) {
      endorsers.push(array_to_base64(endorser));
    }
  }

  return { valid: true, endorsers };
}

export function verify_address_entry(
  address: string,
  entry: AddressEntryKeys,
): AddressEntryVerification {
  try {
    for (const form of address_entry_forms(address)) {
      const verified = verify_entry_for_form(form, entry);

      if (verified) return verified;
    }
  } catch {
    return { valid: false, endorsers: [] };
  }

  return { valid: false, endorsers: [] };
}
