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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

import type { EncryptedVault } from "./key_manager_core";
import {
  derive_public_keys_from_private,
  generate_identity_keypair,
  sign_detached,
} from "./key_manager_pgp";
import { build_pgp_rekey } from "@/services/pgp_rekey_service";
import {
  reset_published_key_heal_attempts,
  reset_published_signing_key_cache,
  select_published_signing_key,
  signing_key_candidates,
} from "./published_signing_key";

const state = vi.hoisted(() => ({
  email: "owner@astermail.org" as string | undefined,
  published_key: undefined as string | undefined,
  fetch_calls: 0,
  throw_on_fetch: false,
  passphrase: "rekey-drift-passphrase" as string | null,
  republish_calls: 0,
  republish_result: true,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({ user: { email: state.email } }),
}));

vi.mock("@/services/api/keys", () => ({
  get_recipient_public_key: async () => {
    state.fetch_calls += 1;

    if (state.throw_on_fetch) throw new Error("network unavailable");

    return { data: { public_key: state.published_key } };
  },
}));

vi.mock("./ensure_pgp_key_published", () => ({
  republish_identity_key: async () => {
    state.republish_calls += 1;

    return state.republish_result;
  },
}));

vi.mock("./memory_key_store", async (import_original) => ({
  ...(await import_original<typeof import("./memory_key_store")>()),
  get_passphrase_from_memory: () => state.passphrase,
}));

const password = "rekey-drift-passphrase";
const owner_email = "owner@astermail.org";
const payload = new TextEncoder().encode(
  "Content-Type: text/plain; charset=utf-8\r\n\r\nsigned after a rekey\r\n",
);

let old_secret_key: string;
let new_secret_key: string;
let published_public_key: string;
let rekeyed_vault: EncryptedVault;

function vault_with(identity_key: string): EncryptedVault {
  return {
    identity_key,
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
}

async function signature_verifies(
  armored_secret_key: string,
  armored_public_key: string,
): Promise<boolean> {
  const signed = await sign_detached(payload, {
    armored_secret_key,
    passphrase: password,
  });

  if (!signed) return false;

  const verification = await openpgp.verify({
    message: await openpgp.createMessage({ binary: payload }),
    signature: await openpgp.readSignature({
      armoredSignature: signed.signature,
    }),
    verificationKeys: await openpgp.readKey({
      armoredKey: armored_public_key,
    }),
    expectSigned: false,
  });

  try {
    return await verification.signatures[0].verified;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  const original = await generate_identity_keypair(
    "Owner",
    owner_email,
    password,
  );

  old_secret_key = original.secret_key;

  const vault = vault_with(old_secret_key);
  const { new_vault } = await build_pgp_rekey(
    vault,
    password,
    owner_email,
    "Owner",
  );

  rekeyed_vault = new_vault;
  new_secret_key = new_vault.previous_keys?.[0] as string;
  published_public_key = (
    await derive_public_keys_from_private([new_secret_key])
  )[0];
}, 120_000);

beforeEach(() => {
  reset_published_signing_key_cache();
  reset_published_key_heal_attempts();
  state.email = owner_email;
  state.published_key = published_public_key;
  state.fetch_calls = 0;
  state.throw_on_fetch = false;
  state.passphrase = password;
  state.republish_calls = 0;
  state.republish_result = true;
});

describe("select_published_signing_key after a pgp rekey", () => {
  it("leaves identity_key pointing at the superseded key", () => {
    expect(rekeyed_vault.identity_key).toBe(old_secret_key);
    expect(new_secret_key).not.toBe(old_secret_key);
    expect(signing_key_candidates(rekeyed_vault)).toEqual([
      old_secret_key,
      new_secret_key,
    ]);
  });

  it("selects the key the server publishes, not the vault default", async () => {
    const selected = await select_published_signing_key(rekeyed_vault);

    expect(selected).toBe(new_secret_key);
    expect(selected).not.toBe(rekeyed_vault.identity_key);
  });

  it("produces a signature that verifies against the published key", async () => {
    const selected = await select_published_signing_key(rekeyed_vault);

    await expect(
      signature_verifies(selected as string, published_public_key),
    ).resolves.toBe(true);
  });

  it("reproduces the reported bug when signing with identity_key", async () => {
    await expect(
      signature_verifies(rekeyed_vault.identity_key, published_public_key),
    ).resolves.toBe(false);
  });

  it("caches the published key across calls", async () => {
    await select_published_signing_key(rekeyed_vault);
    await select_published_signing_key(rekeyed_vault);

    expect(state.fetch_calls).toBe(1);
  });

  it("falls back to identity_key when the lookup throws", async () => {
    state.throw_on_fetch = true;

    await expect(select_published_signing_key(rekeyed_vault)).resolves.toBe(
      old_secret_key,
    );
  });

  it("falls back to identity_key when the server publishes nothing", async () => {
    state.published_key = undefined;

    await expect(select_published_signing_key(rekeyed_vault)).resolves.toBe(
      old_secret_key,
    );
  });

  it("falls back to identity_key when no account email is known", async () => {
    state.email = undefined;

    await expect(select_published_signing_key(rekeyed_vault)).resolves.toBe(
      old_secret_key,
    );
  });

  it("checks the published key even for a single-key vault", async () => {
    const drifted = vault_with(old_secret_key);

    await select_published_signing_key(drifted);

    expect(state.fetch_calls).toBe(1);
  });
});

describe("select_published_signing_key with a drifted vault", () => {
  it("republishes identity_key and signs with it when nothing matches", async () => {
    const drifted = vault_with(old_secret_key);

    await expect(select_published_signing_key(drifted)).resolves.toBe(
      old_secret_key,
    );
    expect(state.republish_calls).toBe(1);
  });

  it("skips signing when the republish fails", async () => {
    state.republish_result = false;
    const drifted = vault_with(old_secret_key);

    await expect(select_published_signing_key(drifted)).resolves.toBeNull();
  });

  it("attempts the republish once per account per session", async () => {
    state.republish_result = false;
    const drifted = vault_with(old_secret_key);

    await select_published_signing_key(drifted);
    await select_published_signing_key(drifted);

    expect(state.republish_calls).toBe(1);
  });

  it("skips signing without republishing when no passphrase is in memory", async () => {
    state.passphrase = null;
    const drifted = vault_with(old_secret_key);

    await expect(select_published_signing_key(drifted)).resolves.toBeNull();
    expect(state.republish_calls).toBe(0);
  });

  it("selects the matching key again after a heal refreshes the cache", async () => {
    const drifted = vault_with(old_secret_key);

    await select_published_signing_key(drifted);

    state.published_key = (
      await derive_public_keys_from_private([old_secret_key])
    )[0];

    await expect(select_published_signing_key(drifted)).resolves.toBe(
      old_secret_key,
    );
    expect(state.republish_calls).toBe(1);
    expect(state.fetch_calls).toBe(2);
  });
});
