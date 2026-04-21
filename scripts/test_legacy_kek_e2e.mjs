import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const HASH_ALG = "SHA-256";
const DERIVED_KEY_LENGTH = 32;
const DERIVED_KEY_INFO = "aster-storage-encryption-key-v1";
const SALT_DERIVATION_PREFIX = "aster-hkdf-salt-v1:";
const MAX_LEGACY_KEKS = 16;

function to_base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function from_base64(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function derive_salt_from_passphrase(passphrase_bytes) {
  const prefix = new TextEncoder().encode(SALT_DERIVATION_PREFIX);
  const combined = new Uint8Array(prefix.length + passphrase_bytes.length);

  combined.set(prefix, 0);
  combined.set(passphrase_bytes, prefix.length);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  return new Uint8Array(hash);
}

async function derive_kek_from_password(password) {
  const passphrase_bytes = new TextEncoder().encode(password);
  const km = await crypto.subtle.importKey(
    "raw",
    passphrase_bytes,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const info = new TextEncoder().encode(DERIVED_KEY_INFO);
  const salt = await derive_salt_from_passphrase(passphrase_bytes);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: HASH_ALG, salt, info },
    km,
    DERIVED_KEY_LENGTH * 8,
  );

  return new Uint8Array(bits);
}

async function import_raw_as_aes_key(raw, usages = ["decrypt"]) {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function serialize_kek_for_vault(raw, added_at = new Date()) {
  return { k: to_base64(raw), added_at: added_at.toISOString() };
}

function prepend_kek_to_list(existing, entry) {
  const list = existing ? [...existing] : [];
  const dup = list.findIndex((e) => e.k === entry.k);

  if (dup >= 0) list.splice(dup, 1);
  list.unshift(entry);

  return list.slice(0, MAX_LEGACY_KEKS);
}

let runtime_legacy_keys = [];

async function load_legacy_keks_into_memory(list) {
  runtime_legacy_keys = [];
  if (!list) return;
  for (const entry of list) {
    try {
      const raw = from_base64(entry.k);

      runtime_legacy_keys.push(await import_raw_as_aes_key(raw));
    } catch {}
  }
}

async function decrypt_aes_gcm_with_fallback(primary_key, ciphertext, iv) {
  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      primary_key,
      ciphertext,
    );
  } catch (primary_error) {
    if (runtime_legacy_keys.length === 0) throw primary_error;
    for (const fallback of runtime_legacy_keys) {
      try {
        return await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          fallback,
          ciphertext,
        );
      } catch {}
    }
    throw primary_error;
  }
}

async function encrypt_with_kek(raw_kek, plaintext) {
  const key = await import_raw_as_aes_key(raw_kek, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return { iv, ct };
}

async function run_tests() {
  console.log("test 1: fresh derive + decrypt with matching KEK");
  const pw1 = "correct horse battery staple 42";
  const kek1 = await derive_kek_from_password(pw1);
  const { iv: iv1, ct: ct1 } = await encrypt_with_kek(kek1, "hello alias 1");
  const primary1 = await import_raw_as_aes_key(kek1);
  const dec1 = await decrypt_aes_gcm_with_fallback(primary1, ct1, iv1);

  assert.equal(new TextDecoder().decode(dec1), "hello alias 1");
  console.log("  OK");

  console.log("test 2: password change, fallback decrypts old ciphertext");
  const pw2 = "new password after rotation 99";
  const kek2 = await derive_kek_from_password(pw2);
  const legacy_list = prepend_kek_to_list(
    undefined,
    serialize_kek_for_vault(kek1),
  );

  assert.equal(legacy_list.length, 1);
  await load_legacy_keks_into_memory(legacy_list);
  const primary2 = await import_raw_as_aes_key(kek2);
  const dec2 = await decrypt_aes_gcm_with_fallback(primary2, ct1, iv1);

  assert.equal(new TextDecoder().decode(dec2), "hello alias 1");
  console.log("  OK");

  console.log("test 3: new ciphertext under new KEK still decrypts via primary");
  const encrypt2 = await encrypt_with_kek(kek2, "new alias under pw2");
  const dec3 = await decrypt_aes_gcm_with_fallback(
    primary2,
    encrypt2.ct,
    encrypt2.iv,
  );

  assert.equal(new TextDecoder().decode(dec3), "new alias under pw2");
  console.log("  OK");

  console.log("test 4: three password rotations, all three generations decrypt");
  const pw3 = "third rotation";
  const kek3 = await derive_kek_from_password(pw3);
  const list2 = prepend_kek_to_list(
    legacy_list,
    serialize_kek_for_vault(kek2),
  );

  assert.equal(list2.length, 2);
  const encrypt_under_pw2 = await encrypt_with_kek(kek2, "alias from era 2");

  await load_legacy_keks_into_memory(list2);
  const primary3 = await import_raw_as_aes_key(kek3);
  const g1 = await decrypt_aes_gcm_with_fallback(primary3, ct1, iv1);
  const g2 = await decrypt_aes_gcm_with_fallback(
    primary3,
    encrypt_under_pw2.ct,
    encrypt_under_pw2.iv,
  );

  assert.equal(new TextDecoder().decode(g1), "hello alias 1");
  assert.equal(new TextDecoder().decode(g2), "alias from era 2");
  console.log("  OK");

  console.log("test 5: wrong key with empty legacy list throws (no silent fail)");
  runtime_legacy_keys = [];
  const stranger_kek = await derive_kek_from_password("wrong");
  const stranger_primary = await import_raw_as_aes_key(stranger_kek);

  await assert.rejects(
    decrypt_aes_gcm_with_fallback(stranger_primary, ct1, iv1),
  );
  console.log("  OK");

  console.log("test 6: 20 rotations capped at 16 most recent");
  let cap_list = undefined;
  const keks = [];

  for (let i = 0; i < 20; i++) {
    const k = await derive_kek_from_password(`pw_${i}`);

    keks.push(k);
    cap_list = prepend_kek_to_list(cap_list, serialize_kek_for_vault(k));
  }
  assert.equal(cap_list.length, MAX_LEGACY_KEKS);
  assert.equal(cap_list[0].k, to_base64(keks[19]));
  assert.equal(cap_list[15].k, to_base64(keks[4]));
  console.log("  OK");

  console.log("test 7: duplicate KEK (same password re-added) moves to front, no duplication");
  let dup_list = prepend_kek_to_list(
    undefined,
    serialize_kek_for_vault(kek1),
  );

  dup_list = prepend_kek_to_list(dup_list, serialize_kek_for_vault(kek2));
  dup_list = prepend_kek_to_list(dup_list, serialize_kek_for_vault(kek1));
  assert.equal(dup_list.length, 2);
  assert.equal(dup_list[0].k, to_base64(kek1));
  console.log("  OK");

  console.log("test 8: tampered ciphertext is rejected (GCM auth) even with fallback");
  const tampered = new Uint8Array(ct1);

  tampered[tampered.length - 1] ^= 1;
  await load_legacy_keks_into_memory(legacy_list);
  await assert.rejects(
    decrypt_aes_gcm_with_fallback(primary2, tampered.buffer, iv1),
  );
  console.log("  OK");

  console.log("test 9: deterministic KEK derivation (same password => same KEK)");
  const kek1b = await derive_kek_from_password(pw1);

  assert.deepEqual(kek1, kek1b);
  console.log("  OK");

  console.log("test 10: different passwords => different KEKs (sanity)");
  assert.notDeepEqual(kek1, kek2);
  console.log("  OK");

  console.log("\nall 10 tests passed");
}

run_tests().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
