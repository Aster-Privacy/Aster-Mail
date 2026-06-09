//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedEnvelope } from "@/types/email";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  decrypt_message_verified,
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
  derive_aes_key_from_bytes,
} from "@/services/crypto/key_manager";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
  normalize_parsed_envelope,
} from "@/services/crypto/envelope";
import { resolve_sender_verification_keys } from "@/services/crypto/sender_verification";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

const INBOUND_ECIES_MARKER = 0x02;
const INBOUND_ECIES_COMPRESSED_MARKER = 0x03;
const INBOUND_PQ_HYBRID_MARKER = 0x04;
const INBOUND_ECIES_EPH_KEY_LEN = 65;
const INBOUND_ML_KEM_CT_LEN = 1088;
const INBOUND_ECIES_INFO = new TextEncoder().encode("aster-inbound-v1");
const INBOUND_PQ_HYBRID_INFO = new TextEncoder().encode("aster-inbound-pq-v1");

async function decompress_zlib(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(compressed);
  writer.close();

  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (value) chunks.push(value);
    done = d;
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function derive_pq_hybrid_aes_key(
  ecdh_shared: ArrayBuffer,
  ml_kem_ss: Uint8Array,
): Promise<CryptoKey> {
  const ikm = new Uint8Array(64);
  ikm.set(new Uint8Array(ecdh_shared), 0);
  ikm.set(ml_kem_ss.slice(0, 32), 32);

  const hkdf_key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: INBOUND_PQ_HYBRID_INFO },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decrypt_inbound_ecies(
  enc_bytes: Uint8Array,
  nonce_bytes: Uint8Array,
  identity_key_jwk_str: string,
  decompress: boolean,
): Promise<Uint8Array | null> {
  try {
    const eph_pub_raw = enc_bytes.slice(1, 1 + INBOUND_ECIES_EPH_KEY_LEN);
    const ciphertext = enc_bytes.slice(1 + INBOUND_ECIES_EPH_KEY_LEN);
    const identity_jwk: JsonWebKey = JSON.parse(identity_key_jwk_str);
    const identity_private = await import_ke_private_key(identity_jwk);
    const eph_public = await import_ke_public_key(eph_pub_raw);
    const shared_bits = await compute_agreement_bits(identity_private, eph_public);
    const aes_key = await derive_aes_key_from_bytes(
      shared_bits,
      new Uint8Array(0),
      INBOUND_ECIES_INFO,
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce_bytes },
      aes_key,
      ciphertext,
    );
    const plain = new Uint8Array(decrypted);
    return decompress ? await decompress_zlib(plain) : plain;
  } catch {
    return null;
  }
}

async function decrypt_inbound_pq_hybrid(
  enc_bytes: Uint8Array,
  nonce_bytes: Uint8Array,
  identity_key_jwk_str: string,
  pq_identity_secret_b64: string,
): Promise<Uint8Array | null> {
  try {
    const eph_pub_raw = enc_bytes.slice(1, 1 + INBOUND_ECIES_EPH_KEY_LEN);
    const ml_kem_ct = enc_bytes.slice(
      1 + INBOUND_ECIES_EPH_KEY_LEN,
      1 + INBOUND_ECIES_EPH_KEY_LEN + INBOUND_ML_KEM_CT_LEN,
    );
    const ciphertext = enc_bytes.slice(1 + INBOUND_ECIES_EPH_KEY_LEN + INBOUND_ML_KEM_CT_LEN);

    const identity_jwk: JsonWebKey = JSON.parse(identity_key_jwk_str);
    const identity_private = await import_ke_private_key(identity_jwk);
    const eph_public = await import_ke_public_key(eph_pub_raw);
    const ecdh_shared = await compute_agreement_bits(identity_private, eph_public);

    const pq_sk = base64_to_array(pq_identity_secret_b64);
    const ml_kem_ss = ml_kem768.decapsulate(ml_kem_ct, pq_sk);

    const aes_key = await derive_pq_hybrid_aes_key(ecdh_shared, ml_kem_ss);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce_bytes },
      aes_key,
      ciphertext,
    );

    return decompress_zlib(new Uint8Array(decrypted));
  } catch {
    return null;
  }
}

const HASH_ALG = ["SHA", "256"].join("-");
const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];

export async function decrypt_mail_envelope<
  T extends { from: { name: string; email: string } } = DecryptedEnvelope,
>(encrypted_envelope: string, envelope_nonce: string): Promise<T | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return normalize_parsed_envelope(JSON.parse(text)) as T;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const first_pass = await decrypt_message_verified(
          text,
          vault.identity_key,
          pass,
        );
        const parsed = normalize_parsed_envelope(
          JSON.parse(first_pass.plaintext),
        ) as T & { from?: { email?: string }; sender_verification?: string };

        if (first_pass.has_signature && parsed?.from?.email) {
          const sender_keys = await resolve_sender_verification_keys(
            parsed.from.email,
          );

          if (sender_keys.length > 0) {
            const verified_pass = await decrypt_message_verified(
              text,
              vault.identity_key,
              pass,
              sender_keys,
            );

            parsed.sender_verification = verified_pass.verification;
          } else {
            parsed.sender_verification = "no_keys";
          }
        } else {
          parsed.sender_verification = first_pass.has_signature
            ? "no_keys"
            : "unsigned";
        }

        return parsed as T;
      }

      return null;
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<T>(
        encrypted_envelope,
        passphrase_bytes,
      );

      zero_uint8_array(passphrase_bytes);

      return result;
    }

    zero_uint8_array(passphrase_bytes);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const enc_bytes = base64_to_array(encrypted_envelope);

    const marker = enc_bytes[0];
    const is_ecies_marker =
      marker === INBOUND_ECIES_MARKER ||
      marker === INBOUND_ECIES_COMPRESSED_MARKER ||
      marker === INBOUND_PQ_HYBRID_MARKER;

    if (is_ecies_marker && enc_bytes.length > 1 + INBOUND_ECIES_EPH_KEY_LEN) {
      const ratchet_key_sets: Array<{
        ecdh: string;
        pq?: string;
      }> = [];
      if (vault.ratchet_identity_key) {
        ratchet_key_sets.push({
          ecdh: vault.ratchet_identity_key,
          pq: vault.ratchet_pq_identity_key,
        });
      }
      for (const prev of vault.ratchet_previous_keys ?? []) {
        if (prev.ratchet_identity_key) {
          ratchet_key_sets.push({
            ecdh: prev.ratchet_identity_key,
            pq: prev.ratchet_pq_identity_key,
          });
        }
      }

      for (const key_set of ratchet_key_sets) {
        let plain: Uint8Array | null = null;

        if (marker === INBOUND_PQ_HYBRID_MARKER && key_set.pq) {
          plain = await decrypt_inbound_pq_hybrid(
            enc_bytes,
            nonce_bytes,
            key_set.ecdh,
            key_set.pq,
          );
        } else if (marker === INBOUND_ECIES_COMPRESSED_MARKER) {
          plain = await decrypt_inbound_ecies(enc_bytes, nonce_bytes, key_set.ecdh, true);
        } else if (marker === INBOUND_ECIES_MARKER) {
          plain = await decrypt_inbound_ecies(enc_bytes, nonce_bytes, key_set.ecdh, false);
        }

        if (plain) {
          return normalize_parsed_envelope(
            JSON.parse(new TextDecoder().decode(plain)),
          ) as T;
        }
      }
    }

    for (const version of ENVELOPE_KEY_VERSIONS) {
      try {
        const key_hash = await crypto.subtle.digest(
          HASH_ALG,
          new TextEncoder().encode(vault.identity_key + version),
        );
        const crypto_key = await crypto.subtle.importKey(
          "raw",
          key_hash,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"],
        );
        const decrypted = await decrypt_aes_gcm_with_fallback(crypto_key, enc_bytes, nonce_bytes);

        const parsed = JSON.parse(new TextDecoder().decode(decrypted));

        return normalize_parsed_envelope(parsed) as T;
      } catch {
        continue;
      }
    }

    if (vault.previous_keys?.length) {
      for (const previous_key of vault.previous_keys) {
        for (const version of ENVELOPE_KEY_VERSIONS) {
          try {
            const key_hash = await crypto.subtle.digest(
              HASH_ALG,
              new TextEncoder().encode(previous_key + version),
            );
            const crypto_key = await crypto.subtle.importKey(
              "raw",
              key_hash,
              { name: "AES-GCM", length: 256 },
              false,
              ["decrypt"],
            );
            const decrypted = await decrypt_aes_gcm_with_fallback(crypto_key, enc_bytes, nonce_bytes);

            const parsed = JSON.parse(new TextDecoder().decode(decrypted));

            return normalize_parsed_envelope(parsed) as T;
          } catch {
            continue;
          }
        }
      }
    }

    return null;
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    zero_uint8_array(passphrase_bytes);

    return null;
  }
}
