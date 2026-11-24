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

import { encrypt_vault } from "./key_manager";
import {
  pin_vault_generation,
  read_vault_generation_pin,
} from "./vault_generation";

const h = vi.hoisted(() => ({
  state: {
    vault: null as EncryptedVault | null,
    passphrase: null as string | null,
  },
  server: null as {
    encrypted_vault: string;
    vault_nonce: string;
    vault_recovered_write_count?: number;
  } | null,
  stores: 0,
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => h.state.vault,
  get_passphrase_from_memory: () => h.state.passphrase,
  store_vault_in_memory: async (vault: EncryptedVault) => {
    h.stores++;
    h.state.vault = vault;
  },
}));

vi.mock("./ratchet_manager", () => ({
  generate_ratchet_keys: async () => {
    throw new Error("unexpected key generation");
  },
  generate_pq_identity_keys: async () => {
    throw new Error("unexpected key generation");
  },
  derive_pq_identity_from_seed: () => null,
}));

vi.mock("./ratchet_prekey_bundle", () => ({
  upload_prekey_bundle_result: async () => ({ ok: true }),
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => ({
    user: { id: "user-A", email: "user-a@example.test" },
  }),
}));

vi.mock("../api/client", () => ({
  api_client: {
    put: async () => ({}),
    post: async () => ({ data: {} }),
    get: async (url: string) => {
      if (!url.includes("/keys/vault") || !h.server) {
        return { error: "Resource not found", code: "NOT_FOUND" };
      }

      return { data: h.server };
    },
  },
}));

import { sync_vault_with_server } from "./ensure_ratchet_keys";

const PASSWORD = "account-password";
const USER_ID = "user-A";

function vault_at(generation: number, tag: string): EncryptedVault {
  return {
    identity_key: "identity-A",
    signed_prekey: "signed-prekey",
    signed_prekey_private: "signed-prekey-private",
    recovery_codes: [`code-${tag}`],
    ratchet_identity_key: `ik-${tag}`,
    ratchet_identity_public: `ipub-${tag}`,
    ratchet_signed_prekey: `spk-${tag}`,
    ratchet_signed_prekey_public: `spkpub-${tag}`,
    vault_generation: generation,
  };
}

async function signed_in_at(memory: EncryptedVault): Promise<string> {
  const cached = await encrypt_vault(memory, PASSWORD);

  localStorage.setItem(
    `astermail_encrypted_vault_${USER_ID}`,
    cached.encrypted_vault,
  );
  localStorage.setItem(`astermail_vault_nonce_${USER_ID}`, cached.vault_nonce);
  pin_vault_generation(USER_ID, memory);
  h.state.vault = memory;
  h.state.passphrase = PASSWORD;

  return cached.encrypted_vault;
}

async function serve(
  vault: EncryptedVault,
  vault_recovered_write_count?: number,
): Promise<string> {
  h.server = {
    ...(await encrypt_vault(vault, PASSWORD)),
    vault_recovered_write_count,
  };

  return h.server.encrypted_vault;
}

beforeEach(() => {
  h.server = null;
  h.stores = 0;
  h.state.vault = null;
  h.state.passphrase = null;
  localStorage.clear();
});

describe("sync_vault_with_server generation check", () => {
  it("refuses a server vault older than the pinned generation", async () => {
    const memory = vault_at(7, "current");
    const cached = await signed_in_at(memory);

    await serve(vault_at(3, "older"));

    const result = await sync_vault_with_server();

    expect(result.status).toBe("unverified");
    expect(h.stores).toBe(0);
    expect(h.state.vault).toBe(memory);
    expect(localStorage.getItem(`astermail_encrypted_vault_${USER_ID}`)).toBe(
      cached,
    );
    expect(read_vault_generation_pin(USER_ID)).toBe(7);
  });

  it("adopts a server vault at or above the pinned generation", async () => {
    await signed_in_at(vault_at(7, "current"));

    const served = await serve(vault_at(8, "newer"));
    const result = await sync_vault_with_server();

    expect(result.status).toBe("adopted");
    expect(h.stores).toBe(1);
    expect(h.state.vault?.vault_generation).toBe(8);
    expect(h.state.vault?.ratchet_identity_public).toBe("ipub-newer");
    expect(localStorage.getItem(`astermail_encrypted_vault_${USER_ID}`)).toBe(
      served,
    );
  });
  it("adopts an older server vault the server reports as newly recovered", async () => {
    await signed_in_at(vault_at(7, "current"));

    const served = await serve(vault_at(3, "recovered"), 12);
    const result = await sync_vault_with_server();

    expect(result.status).toBe("adopted");
    expect(h.stores).toBe(1);
    expect(h.state.vault?.ratchet_identity_public).toBe("ipub-recovered");
    expect(localStorage.getItem(`astermail_encrypted_vault_${USER_ID}`)).toBe(
      served,
    );
    expect(read_vault_generation_pin(USER_ID)).toBe(3);
  });

  it("refuses an older server vault under a recovery it already saw", async () => {
    await signed_in_at(vault_at(7, "current"));
    await serve(vault_at(8, "newer"), 12);
    expect((await sync_vault_with_server()).status).toBe("adopted");

    await serve(vault_at(3, "older"), 12);
    const result = await sync_vault_with_server();

    expect(result.status).toBe("unverified");
    expect(h.stores).toBe(1);
    expect(read_vault_generation_pin(USER_ID)).toBe(7);
  });
});
