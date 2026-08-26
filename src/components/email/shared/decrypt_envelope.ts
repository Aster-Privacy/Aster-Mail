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

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { register_envelope_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import { derive_pq_identity_from_seed } from "@/services/crypto/ratchet_manager";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
  wait_for_keys_ready,
} from "@/services/crypto/memory_key_store";
import {
  decrypt_message_verified_with_any_key,
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
  derive_aes_key_from_bytes,
  type EncryptedVault,
} from "@/services/crypto/key_manager";
import {
  adopt_refreshed_vault,
  fetch_refreshed_vault,
  type RefreshedVault,
} from "@/services/crypto/vault_refresh";
import {
  decrypt_envelope_with_bytes,
  decrypt_envelope_with_identity_key,
  base64_to_array,
  normalize_parsed_envelope,
} from "@/services/crypto/envelope";
import { resolve_sender_verification_keys } from "@/services/crypto/sender_verification";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { ignore_error } from "@/lib/ignore_error";

const INBOUND_ECIES_MARKER = 0x02;
const INBOUND_ECIES_COMPRESSED_MARKER = 0x03;
const INBOUND_PQ_HYBRID_MARKER = 0x04;
const INBOUND_ECIES_EPH_KEY_LEN = 65;
const INBOUND_ML_KEM_CT_LEN = 1088;
const INBOUND_ECIES_INFO = new TextEncoder().encode("aster-inbound-v1");
const INBOUND_PQ_HYBRID_INFO = new TextEncoder().encode("aster-inbound-pq-v1");

const MAX_DECOMPRESSED_BYTES = 48 * 1024 * 1024;

async function decompress_zlib(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  void writer
    .write(compressed)
    .catch((caught) =>
      ignore_error(
        "components/email/shared/decrypt_envelope:decompress_zlib",
        caught,
      ),
    );
  void writer
    .close()
    .catch((caught) =>
      ignore_error(
        "components/email/shared/decrypt_envelope:decompress_zlib",
        caught,
      ),
    );

  const chunks: Uint8Array[] = [];
  let total = 0;
  let done = false;

  while (!done) {
    const { value, done: d } = await reader.read();

    if (value) {
      total += value.length;
      if (total > MAX_DECOMPRESSED_BYTES) {
        await reader.cancel();
        throw new Error("decompressed envelope exceeds size limit");
      }
      chunks.push(value);
    }
    done = d;
  }

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

  const hkdf_key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: INBOUND_PQ_HYBRID_INFO,
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

export async function decrypt_inbound_ecies(
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
    const shared_bits = await compute_agreement_bits(
      identity_private,
      eph_public,
    );
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

export async function decrypt_inbound_pq_hybrid(
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
    const ciphertext = enc_bytes.slice(
      1 + INBOUND_ECIES_EPH_KEY_LEN + INBOUND_ML_KEM_CT_LEN,
    );

    const identity_jwk: JsonWebKey = JSON.parse(identity_key_jwk_str);
    const identity_private = await import_ke_private_key(identity_jwk);
    const eph_public = await import_ke_public_key(eph_pub_raw);
    const ecdh_shared = await compute_agreement_bits(
      identity_private,
      eph_public,
    );

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

interface InboundRatchetKeySet {
  ecdh: string;
  pq?: string;
}

function resolve_inbound_pq(
  secret?: string,
  seed?: string,
): string | undefined {
  if (secret) return secret;
  if (!seed) return undefined;

  return derive_pq_identity_from_seed(seed)?.pq_identity_secret;
}

function collect_inbound_ratchet_key_sets(
  vault: EncryptedVault,
): InboundRatchetKeySet[] {
  const key_sets: InboundRatchetKeySet[] = [];

  if (vault.ratchet_identity_key) {
    key_sets.push({
      ecdh: vault.ratchet_identity_key,
      pq: resolve_inbound_pq(
        vault.ratchet_pq_identity_key,
        vault.ratchet_pq_identity_seed,
      ),
    });
  }
  for (const prev of vault.ratchet_previous_keys ?? []) {
    if (prev.ratchet_identity_key) {
      key_sets.push({
        ecdh: prev.ratchet_identity_key,
        pq: resolve_inbound_pq(
          prev.ratchet_pq_identity_key,
          prev.ratchet_pq_identity_seed,
        ),
      });
    }
  }

  return key_sets;
}

function inbound_key_set_fingerprint(key_set: InboundRatchetKeySet): string {
  return `${key_set.ecdh}|${key_set.pq ?? ""}`;
}

async function decrypt_inbound_with_key_sets(
  key_sets: InboundRatchetKeySet[],
  marker: number,
  enc_bytes: Uint8Array,
  nonce_bytes: Uint8Array,
): Promise<Uint8Array | null> {
  for (const key_set of key_sets) {
    let plain: Uint8Array | null = null;

    if (marker === INBOUND_PQ_HYBRID_MARKER && key_set.pq) {
      plain = await decrypt_inbound_pq_hybrid(
        enc_bytes,
        nonce_bytes,
        key_set.ecdh,
        key_set.pq,
      );
    } else if (marker === INBOUND_ECIES_COMPRESSED_MARKER) {
      plain = await decrypt_inbound_ecies(
        enc_bytes,
        nonce_bytes,
        key_set.ecdh,
        true,
      );
    } else if (marker === INBOUND_ECIES_MARKER) {
      plain = await decrypt_inbound_ecies(
        enc_bytes,
        nonce_bytes,
        key_set.ecdh,
        false,
      );
    }

    if (plain) return plain;
  }

  return null;
}

function collect_envelope_identity_keys(vault: EncryptedVault): string[] {
  const keys: string[] = [];

  if (vault.identity_key) keys.push(vault.identity_key);
  for (const previous_key of vault.previous_keys ?? []) {
    if (previous_key) keys.push(previous_key);
  }

  return keys;
}

export async function decrypt_mail_envelope<T = DecryptedEnvelope>(
  encrypted_envelope: string,
  envelope_nonce: string,
  mail_item_id?: string,
): Promise<T | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        const parsed_obj = JSON.parse(text);

        register_envelope_attachment_keys(mail_item_id, parsed_obj);

        return normalize_parsed_envelope(parsed_obj) as T;
      }

      let vault = get_vault_from_memory();
      let pass = get_passphrase_from_memory();

      if (!vault || !pass) {
        await wait_for_keys_ready();
        vault = get_vault_from_memory();
        pass = get_passphrase_from_memory();
      }

      if (vault?.identity_key && pass) {
        const passphrase = pass;
        const decrypt_pgp_envelope = async (
          envelope_keys: string[],
        ): Promise<T> => {
          const first_pass = await decrypt_message_verified_with_any_key(
            text,
            envelope_keys,
            passphrase,
          );
          const parsed = normalize_parsed_envelope(
            JSON.parse(first_pass.plaintext),
          ) as T & { from?: { email?: string }; sender_verification?: string };

          if (first_pass.has_signature && parsed?.from?.email) {
            const sender_keys = await resolve_sender_verification_keys(
              parsed.from.email,
            );

            if (sender_keys.length > 0) {
              const verified_pass = await decrypt_message_verified_with_any_key(
                text,
                envelope_keys,
                passphrase,
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
        };

        const envelope_keys = collect_envelope_identity_keys(vault);

        try {
          return await decrypt_pgp_envelope(envelope_keys);
        } catch (pgp_error) {
          const refreshed = await fetch_refreshed_vault();

          if (refreshed) {
            const tried = new Set(envelope_keys);
            const refreshed_keys = collect_envelope_identity_keys(
              refreshed.vault,
            ).filter((key) => !tried.has(key));

            if (refreshed_keys.length > 0) {
              const healed = await decrypt_pgp_envelope(refreshed_keys);

              await adopt_refreshed_vault(refreshed);

              return healed;
            }
          }

          throw pgp_error;
        }
      }

      return null;
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return null;
    }
  }

  if (!get_passphrase_from_memory()) {
    await wait_for_keys_ready();
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

    let vault = get_vault_from_memory();
    let recovered_vault_source: RefreshedVault | null = null;

    if (!vault) {
      recovered_vault_source = await fetch_refreshed_vault();
      vault = recovered_vault_source?.vault ?? null;
    }

    if (!vault) return null;

    const adopt_recovered_vault_source = async () => {
      if (recovered_vault_source) {
        await adopt_refreshed_vault(recovered_vault_source);
      }
    };

    const enc_bytes = base64_to_array(encrypted_envelope);

    const marker = enc_bytes[0];
    const is_ecies_marker =
      marker === INBOUND_ECIES_MARKER ||
      marker === INBOUND_ECIES_COMPRESSED_MARKER ||
      marker === INBOUND_PQ_HYBRID_MARKER;
    const minimum_marker_length =
      marker === INBOUND_PQ_HYBRID_MARKER
        ? 1 + INBOUND_ECIES_EPH_KEY_LEN + INBOUND_ML_KEM_CT_LEN
        : 1 + INBOUND_ECIES_EPH_KEY_LEN;

    if (is_ecies_marker && enc_bytes.length > minimum_marker_length) {
      const ratchet_key_sets = collect_inbound_ratchet_key_sets(vault);
      let plain = await decrypt_inbound_with_key_sets(
        ratchet_key_sets,
        marker,
        enc_bytes,
        nonce_bytes,
      );

      if (!plain) {
        const refreshed = await fetch_refreshed_vault();

        if (refreshed) {
          const tried = new Set(
            ratchet_key_sets.map(inbound_key_set_fingerprint),
          );
          const refreshed_key_sets = collect_inbound_ratchet_key_sets(
            refreshed.vault,
          ).filter(
            (key_set) => !tried.has(inbound_key_set_fingerprint(key_set)),
          );

          if (refreshed_key_sets.length > 0) {
            plain = await decrypt_inbound_with_key_sets(
              refreshed_key_sets,
              marker,
              enc_bytes,
              nonce_bytes,
            );

            if (plain) await adopt_refreshed_vault(refreshed);
          }
        }
      }

      if (plain) {
        await adopt_recovered_vault_source();

        const parsed_obj = JSON.parse(new TextDecoder().decode(plain));

        register_envelope_attachment_keys(mail_item_id, parsed_obj);

        return normalize_parsed_envelope(parsed_obj) as T;
      }
    }

    const finalize_envelope = (plaintext: ArrayBuffer): T => {
      const parsed = JSON.parse(new TextDecoder().decode(plaintext));

      register_envelope_attachment_keys(mail_item_id, parsed);

      return normalize_parsed_envelope(parsed) as T;
    };

    const try_identity_keys = async (
      identity_keys: string[],
    ): Promise<T | null> => {
      for (const identity_key of identity_keys) {
        const decrypted = await decrypt_envelope_with_identity_key(
          identity_key,
          enc_bytes,
          nonce_bytes,
          finalize_envelope,
        );

        if (decrypted) return decrypted;
      }

      return null;
    };

    const identity_keys = collect_envelope_identity_keys(vault);
    const from_identity =
      identity_keys.length > 0 ? await try_identity_keys(identity_keys) : null;

    if (from_identity) {
      await adopt_recovered_vault_source();

      return from_identity;
    }

    const refreshed = await fetch_refreshed_vault();

    if (refreshed) {
      const tried = new Set(identity_keys);
      const refreshed_identity_keys = collect_envelope_identity_keys(
        refreshed.vault,
      ).filter((key) => !tried.has(key));

      if (refreshed_identity_keys.length > 0) {
        const healed = await try_identity_keys(refreshed_identity_keys);

        if (healed) {
          await adopt_refreshed_vault(refreshed);

          return healed;
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
