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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as openpgp from "openpgp";

import {
  ensure_published_key_has_account_addresses,
  identity_addresses_missing_from_key,
} from "./pgp_uid_service";

const PASSPHRASE = "correct horse battery staple";

const state = vi.hoisted(() => ({
  vault: null as EncryptedVault | null,
  republished: [] as Record<string, unknown>[],
  saved_vaults: [] as EncryptedVault[],
  republish_fails: false,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => state.vault,
  get_passphrase_from_memory: () => PASSPHRASE,
  store_vault_in_memory: async (vault: EncryptedVault) => {
    state.vault = vault;
  },
  MASTER_KEY_VAULT_FORMAT: 3,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({
    user: { id: "user-1", email: "murati.balazs@astermail.org" },
  }),
}));

vi.mock("@/services/crypto/vault_write_lock", () => ({
  with_vault_write_lock: <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  sync_vault_with_server: async () => ({ status: "current" }),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_vault: async () => ({ encrypted_vault: "sealed", vault_nonce: "n" }),
  prepare_pgp_key_data: async (keys: { public_key: string }) => ({
    public_key_armored: keys.public_key,
  }),
}));

vi.mock("@/services/api/key_rotation", () => ({
  update_vault: async (
    _encrypted: string,
    _nonce: string,
    _format: number,
    _user_id: string,
    _preserve: boolean,
    vault: EncryptedVault,
  ) => {
    state.saved_vaults.push(vault);

    return { success: true };
  },
  republish_pgp_key: async (data: Record<string, unknown>) => {
    if (state.republish_fails) return { error: "offline" };

    state.republished.push(data);

    return { data: { success: true } };
  },
}));

async function make_identity(emails: string[]) {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: emails.map((email) => ({ name: "muratibalazs", email })),
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return { privateKey, publicKey };
}

function vault_for(identity_key: string): EncryptedVault {
  return {
    identity_key,
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
}

async function user_emails(armored: string): Promise<(string | undefined)[]> {
  const key = await openpgp.readKey({ armoredKey: armored });

  return key.users.map((user) => user.userID?.email);
}

describe("ensure_published_key_has_account_addresses", () => {
  beforeEach(() => {
    state.vault = null;
    state.republished = [];
    state.saved_vaults = [];
    state.republish_fails = false;
  });

  it("adds the dotted address to a key published under the dot-free form", async () => {
    const identity = await make_identity(["muratibalazs@astermail.org"]);

    state.vault = vault_for(identity.privateKey);

    const result = await ensure_published_key_has_account_addresses(
      identity.publicKey,
      "murati.balazs@astermail.org",
      "",
    );

    expect(result).toBe("updated");
    expect(state.republished).toHaveLength(1);
    expect(state.saved_vaults).toHaveLength(1);

    const published = state.republished[0].public_key_armored as string;
    const before = await openpgp.readKey({ armoredKey: identity.publicKey });
    const after = await openpgp.readKey({ armoredKey: published });

    expect(after.getFingerprint()).toBe(before.getFingerprint());
    expect(await user_emails(published)).toEqual([
      "murati.balazs@astermail.org",
      "muratibalazs@astermail.org",
    ]);

    const primary = await after.getPrimaryUser();

    expect(primary.user.userID?.email).toBe("murati.balazs@astermail.org");
    await expect(after.verifyPrimaryKey()).resolves.toBeUndefined();

    const sealed = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: "hello" }),
      encryptionKeys: after,
    });
    const unlocked = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({
        armoredKey: state.vault!.identity_key,
      }),
      passphrase: PASSPHRASE,
    });
    const opened = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage: sealed }),
      decryptionKeys: unlocked,
    });

    expect(opened.data).toBe("hello");

    const signed = await openpgp.sign({
      message: await openpgp.createMessage({ text: "signed" }),
      signingKeys: unlocked,
    });
    const checked = await openpgp.verify({
      message: await openpgp.readMessage({ armoredMessage: signed }),
      verificationKeys: before,
    });

    await expect(checked.signatures[0].verified).resolves.toBe(true);
    expect(state.vault!.legacy_identity_keys).toEqual([identity.privateKey]);
  });

  it("does nothing once the published key carries both forms", async () => {
    const identity = await make_identity([
      "murati.balazs@astermail.org",
      "muratibalazs@astermail.org",
    ]);

    state.vault = vault_for(identity.privateKey);

    expect(
      await ensure_published_key_has_account_addresses(
        identity.publicKey,
        "murati.balazs@astermail.org",
        "",
      ),
    ).toBe("unchanged");
    expect(state.republished).toHaveLength(0);
  });

  it("appends the dot-free form after a dotted primary user ID", async () => {
    const identity = await make_identity(["john.smith@astermail.org"]);

    state.vault = vault_for(identity.privateKey);

    expect(
      await ensure_published_key_has_account_addresses(
        identity.publicKey,
        "john.smith@astermail.org",
        "John",
      ),
    ).toBe("updated");
    expect(
      await user_emails(state.republished[0].public_key_armored as string),
    ).toEqual(["john.smith@astermail.org", "johnsmith@astermail.org"]);
  });

  it("republishes a vault that already carries the address but was never published", async () => {
    const vault_identity = await make_identity([
      "ann.lee@astermail.org",
      "annlee@astermail.org",
    ]);
    const published = await openpgp.reformatKey({
      privateKey: await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({
          armoredKey: vault_identity.privateKey,
        }),
        passphrase: PASSPHRASE,
      }),
      userIDs: [{ name: "annlee", email: "annlee@astermail.org" }],
      format: "armored",
    });

    state.vault = vault_for(vault_identity.privateKey);

    expect(
      await ensure_published_key_has_account_addresses(
        published.publicKey,
        "ann.lee@astermail.org",
        "",
      ),
    ).toBe("unchanged");
    expect(state.saved_vaults).toHaveLength(0);
    expect(state.republished).toHaveLength(1);
    expect(
      await user_emails(state.republished[0].public_key_armored as string),
    ).toEqual(["ann.lee@astermail.org", "annlee@astermail.org"]);
  });

  it("never republishes when the vault holds a different key", async () => {
    const published = await make_identity(["muratibalazs@astermail.org"]);
    const other = await make_identity(["muratibalazs@astermail.org"]);

    state.vault = vault_for(other.privateKey);

    expect(
      await ensure_published_key_has_account_addresses(
        published.publicKey,
        "murati.balazs@astermail.org",
        "",
      ),
    ).toBe("unchanged");
    expect(state.republished).toHaveLength(0);
  });

  it("leaves accounts without dots and custom domains alone", async () => {
    const identity = await make_identity(["alice@astermail.org"]);

    state.vault = vault_for(identity.privateKey);

    expect(
      await ensure_published_key_has_account_addresses(
        identity.publicKey,
        "alice@astermail.org",
        "",
      ),
    ).toBe("unchanged");
    expect(
      await ensure_published_key_has_account_addresses(
        identity.publicKey,
        "first.last@example.com",
        "",
      ),
    ).toBe("unchanged");
    expect(state.republished).toHaveLength(0);
  });

  it("tries a failing heal only once per session", async () => {
    const identity = await make_identity(["pat.kim@astermail.org"]);

    state.vault = vault_for(identity.privateKey);
    state.republish_fails = true;

    expect(
      await ensure_published_key_has_account_addresses(
        identity.publicKey,
        "pat.kim@astermail.org",
        "",
      ),
    ).toBe("failed");
    expect(
      await ensure_published_key_has_account_addresses(
        identity.publicKey,
        "pat.kim@astermail.org",
        "",
      ),
    ).toBe("unchanged");
  });
});

describe("identity_addresses_missing_from_key", () => {
  it("reports the dotted form missing from a dot-free key", async () => {
    const identity = await make_identity(["muratibalazs@astermail.org"]);
    const key = await openpgp.readKey({ armoredKey: identity.publicKey });

    expect(
      identity_addresses_missing_from_key(
        key,
        "murati.balazs@astermail.org",
        "Balazs",
      ),
    ).toEqual([{ email: "murati.balazs@astermail.org", name: "Balazs" }]);
  });
});
