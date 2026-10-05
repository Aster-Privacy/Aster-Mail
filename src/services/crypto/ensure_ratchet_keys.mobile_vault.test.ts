// @vitest-environment happy-dom
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

import { describe, it, expect, beforeEach, vi } from "vitest";

import { encrypt_vault, decrypt_vault } from "./key_manager";
import { array_to_base64 } from "./base64";

const h = vi.hoisted(() => ({
  state: {
    vault: null as EncryptedVault | null,
    passphrase: null as string | null,
  },
  put_calls: [] as Array<{ encrypted_vault: string; vault_nonce: string }>,
  identity_regenerations: 0,
  uploaded: [] as EncryptedVault[],
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => h.state.vault,
  get_passphrase_from_memory: () => h.state.passphrase,
  store_vault_in_memory: async (vault: EncryptedVault) => {
    h.state.vault = vault;
  },
}));

vi.mock("./ratchet_manager", () => ({
  generate_ratchet_keys: async () => {
    h.identity_regenerations++;

    return {
      identity_jwk: "regenerated-identity-jwk",
      identity_public: "regenerated-identity-public",
      signed_prekey_jwk: "regenerated-signed-prekey-jwk",
      signed_prekey_public: "regenerated-signed-prekey-public",
      pq_identity_secret: "regenerated-pq-secret",
      pq_identity_public: "regenerated-pq-public",
      pq_identity_seed: "regenerated-pq-seed",
    };
  },
  generate_pq_identity_keys: async () => ({
    pq_identity_secret: "added-pq-secret",
    pq_identity_public: "added-pq-public",
    pq_identity_seed: "added-pq-seed",
  }),
  derive_pq_identity_from_seed: () => null,
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => ({
    user: { id: "user-A", email: "user-a@example.test" },
  }),
}));

vi.mock("./ratchet_prekey_bundle", () => ({
  upload_prekey_bundle_result: async (vault: EncryptedVault) => {
    h.uploaded.push(vault);

    return { ok: true };
  },
}));

vi.mock("../api/client", () => ({
  api_client: {
    put: async (
      _url: string,
      body: { encrypted_vault: string; vault_nonce: string },
    ) => {
      h.put_calls.push({
        encrypted_vault: body.encrypted_vault,
        vault_nonce: body.vault_nonce,
      });

      return {};
    },
    post: async () => ({ data: {} }),
    get: async (url: string) => {
      if (!url.includes("/keys/vault")) {
        return { error: "Resource not found", code: "NOT_FOUND" };
      }

      const last = h.put_calls.length
        ? h.put_calls[h.put_calls.length - 1]
        : null;
      const encrypted_vault =
        last?.encrypted_vault ??
        localStorage.getItem("astermail_encrypted_vault_user-A");
      const vault_nonce =
        last?.vault_nonce ??
        localStorage.getItem("astermail_vault_nonce_user-A");

      if (!encrypted_vault || !vault_nonce) {
        return { error: "Resource not found", code: "NOT_FOUND" };
      }

      return { data: { encrypted_vault, vault_nonce } };
    },
  },
}));

import { ensure_ratchet_keys } from "./ensure_ratchet_keys";

const PASSWORD = "account-password";

interface MobileKeypair {
  compact_jwk: string;
  full_jwk: string;
  public_b64: string;
}

async function generate_mobile_keypair(): Promise<MobileKeypair> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);
  const public_raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keypair.publicKey),
  );

  return {
    compact_jwk: JSON.stringify({ kty: "EC", crv: "P-256", d: jwk.d }),
    full_jwk: JSON.stringify(jwk),
    public_b64: array_to_base64(public_raw),
  };
}

function mobile_vault(
  identity: MobileKeypair,
  signed_prekey: MobileKeypair,
): EncryptedVault {
  return {
    identity_key: "identity-A",
    signed_prekey: "signed-prekey",
    signed_prekey_private: "signed-prekey-private",
    recovery_codes: ["code-one"],
    ratchet_identity_key: identity.compact_jwk,
    ratchet_identity_public: identity.public_b64,
    ratchet_signed_prekey: signed_prekey.compact_jwk,
    ratchet_signed_prekey_public: signed_prekey.public_b64,
  };
}

async function seed_signed_in_vault(vault: EncryptedVault): Promise<void> {
  const sealed = await encrypt_vault(vault, PASSWORD);

  localStorage.setItem(
    "astermail_encrypted_vault_user-A",
    sealed.encrypted_vault,
  );
  localStorage.setItem("astermail_vault_nonce_user-A", sealed.vault_nonce);
  h.state.vault = vault;
  h.state.passphrase = PASSWORD;
}

async function server_vault(): Promise<EncryptedVault> {
  const last = h.put_calls[h.put_calls.length - 1];

  return decrypt_vault(last.encrypted_vault, last.vault_nonce, PASSWORD);
}

describe("first sign-in to a vault created by a mobile app", () => {
  beforeEach(() => {
    h.put_calls.length = 0;
    h.uploaded.length = 0;
    h.identity_regenerations = 0;
    localStorage.clear();
  });

  it("keeps the compact encryption identity and only adds a post-quantum key", async () => {
    const identity = await generate_mobile_keypair();
    const signed_prekey = await generate_mobile_keypair();

    await seed_signed_in_vault(mobile_vault(identity, signed_prekey));

    expect(await ensure_ratchet_keys()).toBe(true);

    const saved = await server_vault();

    expect(h.identity_regenerations).toBe(0);
    expect(saved.ratchet_identity_key).toBe(identity.compact_jwk);
    expect(saved.ratchet_identity_public).toBe(identity.public_b64);
    expect(saved.ratchet_signed_prekey).toBe(signed_prekey.compact_jwk);
    expect(saved.ratchet_signed_prekey_public).toBe(signed_prekey.public_b64);
    expect(saved.ratchet_pq_identity_public).toBe("added-pq-public");
    expect(saved.ratchet_previous_keys ?? []).toHaveLength(0);
    expect(h.uploaded.at(-1)?.ratchet_identity_public).toBe(
      identity.public_b64,
    );
  });

  it("does not replace the identity on a later sign-in from a new browser", async () => {
    const identity = await generate_mobile_keypair();
    const signed_prekey = await generate_mobile_keypair();

    await seed_signed_in_vault(mobile_vault(identity, signed_prekey));
    await ensure_ratchet_keys();

    const after_first = await server_vault();

    localStorage.clear();
    await seed_signed_in_vault(after_first);
    h.put_calls.length = 0;

    expect(await ensure_ratchet_keys()).toBe(true);
    expect(h.identity_regenerations).toBe(0);
    expect(h.state.vault?.ratchet_identity_key).toBe(identity.compact_jwk);
  });

  it("keeps an identity that the mobile app restored without the web marker", async () => {
    const identity = await generate_mobile_keypair();
    const signed_prekey = await generate_mobile_keypair();
    const replaced = await generate_mobile_keypair();
    const vault: EncryptedVault = {
      ...mobile_vault(identity, signed_prekey),
      ratchet_pq_identity_key: "existing-pq-secret",
      ratchet_pq_identity_public: "existing-pq-public",
      ratchet_pq_identity_seed: "existing-pq-seed",
      ratchet_previous_keys: [
        {
          ratchet_identity_key: replaced.full_jwk,
          ratchet_identity_public: replaced.public_b64,
          ratchet_signed_prekey: replaced.full_jwk,
          ratchet_signed_prekey_public: replaced.public_b64,
        },
      ],
    };

    await seed_signed_in_vault(vault);

    expect(await ensure_ratchet_keys()).toBe(true);
    expect(h.identity_regenerations).toBe(0);
    expect(h.state.vault?.ratchet_identity_key).toBe(identity.compact_jwk);
    expect(h.uploaded.at(-1)?.ratchet_identity_public).toBe(
      identity.public_b64,
    );
  });
});
