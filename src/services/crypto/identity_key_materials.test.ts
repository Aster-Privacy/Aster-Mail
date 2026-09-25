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
import type { EncryptedVault } from "./key_manager_core";

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as openpgp from "openpgp";

import {
  generate_identity_keypair,
  generate_signed_prekey,
} from "./key_manager_pgp";
import {
  MAX_LEGACY_IDENTITY_KEYS,
  MAX_PREVIOUS_KEYS,
  merge_recovered_identity_keys,
  reprotect_vault_keys_for_password_change,
  retained_identity_key_materials,
  vault_identity_key_materials,
} from "./identity_key_materials";
import {
  decrypt_envelope_with_identity_key,
  encrypt_envelope_with_identity_key,
} from "./envelope";
import {
  clear_legacy_keks_from_memory,
  decrypt_aes_gcm_with_fallback,
  load_previous_key_derived_keks_into_memory,
} from "./legacy_keks";
import { base64_to_array } from "./base64";
import { reprotect_pgp_key } from "./key_manager_pgp_keygen";

const PASS_1 = "first vault passphrase for tests";
const PASS_2 = "second vault passphrase for tests";
const PASS_3 = "third vault passphrase for tests";
const PASS_4 = "fourth vault passphrase for tests";

let identity: { secret_key: string; public_key: string };
let recovered_identity: { secret_key: string; public_key: string };
let prekey_private: string;

async function fingerprint(armored: string): Promise<string> {
  return (await openpgp.readKey({ armoredKey: armored })).getFingerprint();
}

async function unlocks(armored: string, passphrase: string): Promise<boolean> {
  try {
    await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: armored }),
      passphrase,
    });

    return true;
  } catch {
    return false;
  }
}

function base_vault(previous_keys: string[] = []): EncryptedVault {
  return {
    identity_key: identity.secret_key,
    previous_keys,
    signed_prekey: "",
    signed_prekey_private: prekey_private,
    recovery_codes: [],
  };
}

async function open_import_envelope(
  materials: string[],
  sealed: { encrypted: string; nonce: string },
): Promise<unknown> {
  for (const material of materials) {
    const opened = await decrypt_envelope_with_identity_key(
      material,
      base64_to_array(sealed.encrypted),
      base64_to_array(sealed.nonce),
      (plain) => JSON.parse(new TextDecoder().decode(plain)),
    );

    if (opened) return opened;
  }

  return null;
}

async function seal_with_context(material: string, context: string) {
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material + context),
  );
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode("scheduled payload"),
  );

  return { iv, ciphertext };
}

beforeAll(async () => {
  identity = await generate_identity_keypair(
    "Ana",
    "ana@astermail.org",
    PASS_1,
  );
  recovered_identity = await generate_identity_keypair(
    "Ana",
    "ana@astermail.org",
    PASS_1,
  );
  prekey_private = (
    await generate_signed_prekey(
      "Ana",
      "ana@astermail.org",
      PASS_1,
      identity.secret_key,
    )
  ).keypair.secret_key;
}, 60000);

afterEach(() => {
  clear_legacy_keks_from_memory();
});

describe("password change keeps identity-scoped data readable", () => {
  it("imported mail sealed before the change still opens afterward", async () => {
    const vault = base_vault();
    const sealed = await encrypt_envelope_with_identity_key(
      { subject: "imported before the change" },
      vault.identity_key,
    );

    await reprotect_vault_keys_for_password_change(vault, PASS_1, PASS_2);

    const without_legacy = await open_import_envelope(
      [vault.identity_key, ...(vault.previous_keys ?? [])],
      sealed,
    );

    expect(without_legacy).toBeNull();
    expect(
      await open_import_envelope(vault_identity_key_materials(vault), sealed),
    ).toEqual({ subject: "imported before the change" });
  }, 60000);

  it("mail sealed between two changes and before both still opens after the second", async () => {
    const vault = base_vault();
    const first = await encrypt_envelope_with_identity_key(
      { n: 1 },
      vault.identity_key,
    );

    await reprotect_vault_keys_for_password_change(vault, PASS_1, PASS_2);
    const second = await encrypt_envelope_with_identity_key(
      { n: 2 },
      vault.identity_key,
    );

    await reprotect_vault_keys_for_password_change(vault, PASS_2, PASS_3);
    const materials = vault_identity_key_materials(vault);

    expect(await open_import_envelope(materials, first)).toEqual({ n: 1 });
    expect(await open_import_envelope(materials, second)).toEqual({ n: 2 });
  }, 60000);

  it("identity-scoped settings sealed before the change open through the fallback pool", async () => {
    const vault = base_vault();
    const { iv, ciphertext } = await seal_with_context(
      vault.identity_key,
      "astermail-scheduled-v1",
    );

    await reprotect_vault_keys_for_password_change(vault, PASS_1, PASS_2);
    await load_previous_key_derived_keks_into_memory([
      ...(vault.previous_keys ?? []),
      ...(vault.legacy_identity_keys ?? []),
    ]);

    const wrong_primary = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const plain = await decrypt_aes_gcm_with_fallback(
      wrong_primary,
      ciphertext,
      iv,
    );

    expect(new TextDecoder().decode(plain)).toBe("scheduled payload");
  }, 60000);
});

describe("password change key bookkeeping", () => {
  it("re-locks the identity, previous keys, and prekey under the new password only", async () => {
    const vault = base_vault([recovered_identity.secret_key]);

    await reprotect_vault_keys_for_password_change(vault, PASS_1, PASS_2);

    expect(await unlocks(vault.identity_key, PASS_2)).toBe(true);
    expect(await unlocks(vault.identity_key, PASS_1)).toBe(false);
    expect(await unlocks(vault.signed_prekey_private, PASS_2)).toBe(true);
    for (const previous_key of vault.previous_keys ?? []) {
      expect(await unlocks(previous_key, PASS_2)).toBe(true);
    }
    expect(await fingerprint(vault.identity_key)).toBe(
      await fingerprint(identity.secret_key),
    );
  }, 60000);

  it("keeps one copy of each key in previous_keys across repeated changes", async () => {
    const vault = base_vault([recovered_identity.secret_key]);
    const passwords = [PASS_1, PASS_2, PASS_3, PASS_4];

    for (let i = 0; i < passwords.length - 1; i += 1) {
      await reprotect_vault_keys_for_password_change(
        vault,
        passwords[i],
        passwords[i + 1],
      );
    }

    const fingerprints = await Promise.all(
      (vault.previous_keys ?? []).map(fingerprint),
    );

    expect(fingerprints).toHaveLength(2);
    expect(new Set(fingerprints)).toEqual(
      new Set([
        await fingerprint(identity.secret_key),
        await fingerprint(recovered_identity.secret_key),
      ]),
    );
  }, 60000);

  it("retains one material per change plus the first copy of each older key", async () => {
    const vault = base_vault([recovered_identity.secret_key]);
    const original_identity = vault.identity_key;

    await reprotect_vault_keys_for_password_change(vault, PASS_1, PASS_2);
    expect(vault.legacy_identity_keys).toEqual([
      original_identity,
      recovered_identity.secret_key,
    ]);

    const second_identity = vault.identity_key;

    await reprotect_vault_keys_for_password_change(vault, PASS_2, PASS_3);
    expect(vault.legacy_identity_keys).toEqual([
      second_identity,
      original_identity,
      recovered_identity.secret_key,
    ]);
  }, 60000);

  it("ignores stale copies of the current identity already in previous_keys", async () => {
    const stale_copy = identity.secret_key.replace(/\r?\n/g, "\n") + "\n";
    const vault = base_vault([stale_copy, recovered_identity.secret_key]);

    const retained = await retained_identity_key_materials(vault);

    expect(retained).toEqual([
      identity.secret_key,
      recovered_identity.secret_key,
    ]);
  }, 60000);

  it("caps retained materials", async () => {
    const vault = base_vault();

    vault.legacy_identity_keys = Array.from(
      { length: MAX_LEGACY_IDENTITY_KEYS + 5 },
      (_, i) => `not a key ${i}`,
    );

    const retained = await retained_identity_key_materials(vault);

    expect(retained).toHaveLength(MAX_LEGACY_IDENTITY_KEYS);
    expect(retained[0]).toBe(identity.secret_key);
  }, 60000);

  it("lists materials in order without duplicates or blanks", () => {
    expect(
      vault_identity_key_materials({
        identity_key: "a",
        previous_keys: ["b", "a", ""],
        legacy_identity_keys: ["c", "b"],
      }),
    ).toEqual(["a", "b", "c"]);
    expect(vault_identity_key_materials(null)).toEqual([]);
  });
});

describe("recovering identity keys from an archived key set", () => {
  let reset_identity: string;

  beforeAll(async () => {
    reset_identity = await reprotect_pgp_key(
      recovered_identity.secret_key,
      PASS_1,
      PASS_2,
    );
  }, 60000);

  function reset_vault(previous_keys: string[] = []): EncryptedVault {
    return {
      identity_key: reset_identity,
      previous_keys,
      signed_prekey: "",
      signed_prekey_private: "",
      recovery_codes: [],
    };
  }

  it("relocks the archived key under the current password so old mail opens", async () => {
    const message = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: "sent before the reset" }),
      encryptionKeys: await openpgp.readKey({
        armoredKey: identity.public_key,
      }),
    });

    const result = await merge_recovered_identity_keys(
      reset_vault([reset_identity]),
      [base_vault()],
      PASS_1,
      PASS_2,
    );

    expect(result.absorbed).toEqual([true]);
    expect(result.previous_keys[0]).toBe(reset_identity);

    const fingerprints = await Promise.all(
      result.previous_keys.map(fingerprint),
    );
    const index = fingerprints.indexOf(await fingerprint(identity.secret_key));

    expect(index).toBeGreaterThan(0);
    expect(await unlocks(result.previous_keys[index], PASS_2)).toBe(true);
    expect(await unlocks(result.previous_keys[index], PASS_1)).toBe(false);

    const decryption_key = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({
        armoredKey: result.previous_keys[index],
      }),
      passphrase: PASS_2,
    });
    const { data } = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage: message as string }),
      decryptionKeys: decryption_key,
    });

    expect(data).toBe("sent before the reset");
  }, 60000);

  it("keeps the archived armored keys as legacy material after the ones already held", async () => {
    const vault = { ...reset_vault(), legacy_identity_keys: ["held-material"] };

    const result = await merge_recovered_identity_keys(
      vault,
      [base_vault()],
      PASS_1,
      PASS_2,
    );

    expect(result.legacy_identity_keys[0]).toBe("held-material");
    expect(result.legacy_identity_keys).toContain(identity.secret_key);
  }, 60000);

  it("never evicts a key the vault already holds", async () => {
    const held = Array.from(
      { length: MAX_PREVIOUS_KEYS },
      (_, index) => `held-key-${index}`,
    );

    const result = await merge_recovered_identity_keys(
      reset_vault(held),
      [base_vault()],
      PASS_1,
      PASS_2,
    );

    expect(result.previous_keys).toEqual(held);
    expect(result.absorbed).toEqual([false]);
  }, 60000);

  it("reports the set as not absorbed when the password does not open its key", async () => {
    const result = await merge_recovered_identity_keys(
      reset_vault([reset_identity]),
      [base_vault()],
      PASS_3,
      PASS_2,
    );

    expect(result.absorbed).toEqual([false]);
    expect(result.previous_keys).toEqual([reset_identity]);
  }, 60000);

  it("does not duplicate a key the vault already holds", async () => {
    const already = await reprotect_pgp_key(
      identity.secret_key,
      PASS_1,
      PASS_2,
    );

    const result = await merge_recovered_identity_keys(
      reset_vault([reset_identity, already]),
      [base_vault()],
      PASS_1,
      PASS_2,
    );

    expect(result.previous_keys).toEqual([reset_identity, already]);
    expect(result.absorbed).toEqual([true]);
  }, 60000);

  it("caps legacy material without dropping what the vault already held", async () => {
    const held = Array.from(
      { length: MAX_LEGACY_IDENTITY_KEYS },
      (_, index) => `held-material-${index}`,
    );

    const result = await merge_recovered_identity_keys(
      { ...reset_vault(), legacy_identity_keys: held },
      [base_vault()],
      PASS_1,
      PASS_2,
    );

    expect(result.legacy_identity_keys).toEqual(held);
  }, 60000);
});
