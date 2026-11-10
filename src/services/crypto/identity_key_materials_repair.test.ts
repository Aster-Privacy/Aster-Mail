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

import { describe, it, expect, beforeAll } from "vitest";
import * as openpgp from "openpgp";

import {
  generate_identity_keypair,
  generate_signed_prekey,
} from "./key_manager_pgp";
import {
  repair_vault_pgp_keys,
  vault_identity_key_materials,
} from "./identity_key_materials";
import {
  decrypt_envelope_with_identity_key,
  encrypt_envelope_with_identity_key,
} from "./envelope";
import { base64_to_array } from "./base64";
import { reprotect_pgp_key } from "./key_manager_pgp_keygen";

const OLD_PASSWORD = "password before the change";
const CURRENT_PASSWORD = "password after the change";
const WRONG_PASSWORD = "a password that was never used";

let identity_on_old: string;
let prekey_on_old: string;
let older_identity_on_old: string;

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

function vault_with(overrides: Partial<EncryptedVault> = {}): EncryptedVault {
  return {
    identity_key: identity_on_old,
    previous_keys: [identity_on_old],
    legacy_identity_keys: [],
    signed_prekey: "",
    signed_prekey_private: prekey_on_old,
    recovery_codes: [],
    ...overrides,
  };
}

async function on_current(armored: string): Promise<string> {
  return reprotect_pgp_key(armored, OLD_PASSWORD, CURRENT_PASSWORD);
}

beforeAll(async () => {
  const identity = await generate_identity_keypair(
    "Mark",
    "mark@aster.cx",
    OLD_PASSWORD,
  );
  const older = await generate_identity_keypair(
    "Mark",
    "mark@aster.cx",
    OLD_PASSWORD,
  );

  identity_on_old = identity.secret_key;
  older_identity_on_old = older.secret_key;
  prekey_on_old = (
    await generate_signed_prekey(
      "Mark",
      "mark@aster.cx",
      OLD_PASSWORD,
      identity.secret_key,
    )
  ).keypair.secret_key;
}, 60000);

describe("repair_vault_pgp_keys", () => {
  it("relocks keys still on the previous password so the current one opens them", async () => {
    const vault = vault_with();

    expect(await unlocks(vault.identity_key, CURRENT_PASSWORD)).toBe(false);

    const repair = await repair_vault_pgp_keys(
      vault,
      OLD_PASSWORD,
      CURRENT_PASSWORD,
    );

    expect(repair.repaired).toBe(2);
    expect(repair.locked).toBe(0);
    expect(await unlocks(repair.identity_key, CURRENT_PASSWORD)).toBe(true);
    expect(await unlocks(repair.signed_prekey_private, CURRENT_PASSWORD)).toBe(
      true,
    );
    expect(repair.previous_keys).toHaveLength(1);
    expect(await unlocks(repair.previous_keys[0], CURRENT_PASSWORD)).toBe(true);
    expect(await fingerprint(repair.identity_key)).toBe(
      await fingerprint(identity_on_old),
    );
    expect(repair.legacy_identity_keys).toContain(identity_on_old);
  });

  it("keeps envelopes sealed with the old key text readable", async () => {
    const vault = vault_with();
    const sealed = await encrypt_envelope_with_identity_key(
      { subject: "before the repair" },
      vault.identity_key,
    );
    const repair = await repair_vault_pgp_keys(
      vault,
      OLD_PASSWORD,
      CURRENT_PASSWORD,
    );
    let opened: unknown = null;

    for (const material of vault_identity_key_materials(repair)) {
      opened = await decrypt_envelope_with_identity_key(
        material,
        base64_to_array(sealed.encrypted),
        base64_to_array(sealed.nonce),
        (plain) => JSON.parse(new TextDecoder().decode(plain)),
      );
      if (opened) break;
    }

    expect(opened).toEqual({ subject: "before the repair" });
  });

  it("leaves keys that already open with the current password untouched", async () => {
    const identity_on_current = await on_current(identity_on_old);
    const prekey_on_current = await on_current(prekey_on_old);
    const vault = vault_with({
      identity_key: identity_on_current,
      previous_keys: [identity_on_current],
      signed_prekey_private: prekey_on_current,
      legacy_identity_keys: [identity_on_old],
    });

    const repair = await repair_vault_pgp_keys(
      vault,
      OLD_PASSWORD,
      CURRENT_PASSWORD,
    );

    expect(repair.repaired).toBe(0);
    expect(repair.locked).toBe(0);
    expect(repair.identity_key).toBe(identity_on_current);
    expect(repair.signed_prekey_private).toBe(prekey_on_current);
    expect(repair.previous_keys).toEqual([identity_on_current]);
    expect(repair.legacy_identity_keys).toEqual([identity_on_old]);
  });

  it("repairs only the keys that are still locked", async () => {
    const identity_on_current = await on_current(identity_on_old);
    const prekey_on_current = await on_current(prekey_on_old);
    const vault = vault_with({
      identity_key: identity_on_current,
      previous_keys: [identity_on_current, older_identity_on_old],
      signed_prekey_private: prekey_on_current,
    });

    const repair = await repair_vault_pgp_keys(
      vault,
      OLD_PASSWORD,
      CURRENT_PASSWORD,
    );

    expect(repair.repaired).toBe(1);
    expect(repair.identity_key).toBe(identity_on_current);
    expect(repair.signed_prekey_private).toBe(prekey_on_current);
    expect(repair.previous_keys).toHaveLength(2);
    expect(repair.previous_keys[0]).toBe(identity_on_current);
    expect(await unlocks(repair.previous_keys[1], CURRENT_PASSWORD)).toBe(true);
    expect(repair.legacy_identity_keys).toEqual([older_identity_on_old]);
  });

  it("recovers a key held only in the legacy list", async () => {
    const identity_on_current = await on_current(identity_on_old);
    const prekey_on_current = await on_current(prekey_on_old);
    const vault = vault_with({
      identity_key: identity_on_current,
      previous_keys: [identity_on_current],
      signed_prekey_private: prekey_on_current,
      legacy_identity_keys: [identity_on_old, older_identity_on_old],
    });

    const repair = await repair_vault_pgp_keys(
      vault,
      OLD_PASSWORD,
      CURRENT_PASSWORD,
    );

    expect(repair.repaired).toBe(1);
    expect(repair.previous_keys).toHaveLength(2);
    expect(await fingerprint(repair.previous_keys[1])).toBe(
      await fingerprint(older_identity_on_old),
    );
    expect(await unlocks(repair.previous_keys[1], CURRENT_PASSWORD)).toBe(true);
    expect([...(repair.legacy_identity_keys ?? [])].sort()).toEqual(
      [identity_on_old, older_identity_on_old].sort(),
    );
  });

  it("changes nothing when the old password is wrong", async () => {
    const vault = vault_with({ legacy_identity_keys: [identity_on_old] });

    const repair = await repair_vault_pgp_keys(
      vault,
      WRONG_PASSWORD,
      CURRENT_PASSWORD,
    );

    expect(repair.repaired).toBe(0);
    expect(repair.locked).toBe(2);
    expect(repair.identity_key).toBe(identity_on_old);
    expect(repair.signed_prekey_private).toBe(prekey_on_old);
    expect(repair.previous_keys).toEqual([identity_on_old]);
    expect(repair.legacy_identity_keys).toEqual([identity_on_old]);
    expect(await unlocks(repair.identity_key, CURRENT_PASSWORD)).toBe(false);
  });
});
