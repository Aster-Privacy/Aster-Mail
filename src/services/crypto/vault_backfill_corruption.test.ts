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
import { describe, it, expect, beforeEach, vi } from "vitest";

import { encrypt_vault, decrypt_vault } from "./key_manager";
import type { EncryptedVault } from "./key_manager_core";

const h = vi.hoisted(() => ({
  state: {
    vault: null as EncryptedVault | null,
    passphrase: null as string | null,
    account_id: "user-A",
  },
  put_calls: [] as Array<{ encrypted_vault: string; vault_nonce: string }>,
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => h.state.vault,
  get_passphrase_from_memory: () => h.state.passphrase,
  store_vault_in_memory: async () => {},
}));

vi.mock("./ratchet_manager", () => ({
  generate_ratchet_keys: async () => ({
    identity_jwk: "ratchet-identity-jwk",
    identity_public: "ratchet-identity-public",
    signed_prekey_jwk: "ratchet-signed-prekey-jwk",
    signed_prekey_public: "ratchet-signed-prekey-public",
    pq_identity_secret: "pq-identity-secret",
    pq_identity_public: "pq-identity-public",
  }),
  generate_pq_identity_keys: async () => ({
    pq_identity_secret: "pq-identity-secret",
    pq_identity_public: "pq-identity-public",
  }),
  upload_prekey_bundle: async () => {},
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => ({ user: { id: h.state.account_id } }),
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
  },
}));

import { ensure_ratchet_keys } from "./ensure_ratchet_keys";

const REAL_PASSWORD = "real-password-of-account-A";

function base_vault(): EncryptedVault {
  return {
    identity_key: "identity-A",
    signed_prekey: "signed-prekey",
    signed_prekey_private: "signed-prekey-private",
    recovery_codes: ["code-one", "code-two"],
  };
}

async function seed_login_vault(): Promise<void> {
  const login = await encrypt_vault(base_vault(), REAL_PASSWORD);

  localStorage.setItem(
    "astermail_encrypted_vault_user-A",
    login.encrypted_vault,
  );
  localStorage.setItem("astermail_vault_nonce_user-A", login.vault_nonce);
}

function authoritative_server_vault(): {
  encrypted_vault: string;
  vault_nonce: string;
} {
  if (h.put_calls.length) return h.put_calls[h.put_calls.length - 1];

  return {
    encrypted_vault: localStorage.getItem("astermail_encrypted_vault_user-A")!,
    vault_nonce: localStorage.getItem("astermail_vault_nonce_user-A")!,
  };
}

describe("ratchet backfill vault corruption", () => {
  beforeEach(async () => {
    h.put_calls.length = 0;
    h.state.account_id = "user-A";
    localStorage.clear();
    await seed_login_vault();
  });

  it("never leaves a server vault the account password cannot open (desynced passphrase)", async () => {
    h.state.vault = base_vault();
    h.state.passphrase = "passphrase-belonging-to-a-different-account";

    await ensure_ratchet_keys();

    const server = authoritative_server_vault();

    await expect(
      decrypt_vault(server.encrypted_vault, server.vault_nonce, REAL_PASSWORD),
    ).resolves.toMatchObject({ identity_key: "identity-A" });
  });

  it("still completes a legitimate backfill when the passphrase is correct", async () => {
    h.state.vault = base_vault();
    h.state.passphrase = REAL_PASSWORD;

    await ensure_ratchet_keys();

    const server = authoritative_server_vault();
    const decrypted = await decrypt_vault(
      server.encrypted_vault,
      server.vault_nonce,
      REAL_PASSWORD,
    );

    expect(decrypted.identity_key).toBe("identity-A");
    expect(decrypted.ratchet_identity_key).toBeTruthy();
  });
});
