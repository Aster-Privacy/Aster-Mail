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
import type { EncryptedVault, RatchetKeySet } from "./key_manager_core";

import { describe, it, expect, beforeEach, vi } from "vitest";

import { encrypt_vault, decrypt_vault } from "./key_manager";

const h = vi.hoisted(() => ({
  state: {
    vault: null as EncryptedVault | null,
    passphrase: null as string | null,
  },
  server: null as { encrypted_vault: string; vault_nonce: string } | null,
  get_failure: null as { error: string; code: string } | null,
  put_fails: false,
  put_calls: 0,
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
      url: string,
      body: { encrypted_vault: string; vault_nonce: string },
    ) => {
      if (!url.includes("/keys/vault")) return {};

      h.put_calls++;

      if (h.put_fails) return { error: "Conflict", code: "CONFLICT" };

      h.server = {
        encrypted_vault: body.encrypted_vault,
        vault_nonce: body.vault_nonce,
      };

      return {};
    },
    post: async () => ({ data: {} }),
    get: async (url: string) => {
      if (!url.includes("/keys/vault")) {
        return { error: "Resource not found", code: "NOT_FOUND" };
      }

      if (h.get_failure) return h.get_failure;

      if (!h.server) return { error: "Resource not found", code: "NOT_FOUND" };

      return { data: h.server };
    },
  },
}));

import {
  ensure_ratchet_keys,
  publish_vaulted_prekey_bundle,
  sync_vault_with_server,
} from "./ensure_ratchet_keys";

const PASSWORD = "account-password";

function key_set(tag: string): RatchetKeySet {
  return {
    ratchet_identity_key: `ik-${tag}`,
    ratchet_identity_public: `ipub-${tag}`,
    ratchet_signed_prekey: `spk-${tag}`,
    ratchet_signed_prekey_public: `spkpub-${tag}`,
    ratchet_pq_identity_key: `pq-${tag}`,
    ratchet_pq_identity_public: `pqpub-${tag}`,
    ratchet_pq_identity_seed: `seed-${tag}`,
  };
}

function vault_with(
  current: RatchetKeySet | null,
  previous: RatchetKeySet[] = [],
): EncryptedVault {
  return {
    identity_key: "identity-A",
    signed_prekey: "signed-prekey",
    signed_prekey_private: "signed-prekey-private",
    recovery_codes: ["code-one"],
    ...(current ?? {}),
    ratchet_previous_keys: previous,
  };
}

async function sign_in(
  memory: EncryptedVault,
  server: EncryptedVault | null,
  server_password = PASSWORD,
): Promise<void> {
  const cached = await encrypt_vault(memory, PASSWORD);

  localStorage.setItem(
    "astermail_encrypted_vault_user-A",
    cached.encrypted_vault,
  );
  localStorage.setItem("astermail_vault_nonce_user-A", cached.vault_nonce);
  h.server = server ? await encrypt_vault(server, server_password) : null;
  h.state.vault = memory;
  h.state.passphrase = PASSWORD;
}

beforeEach(() => {
  h.server = null;
  h.get_failure = null;
  h.put_fails = false;
  h.put_calls = 0;
  h.identity_regenerations = 0;
  h.uploaded.length = 0;
  h.state.vault = null;
  h.state.passphrase = null;
  localStorage.clear();
});

describe("prekey bundle publish gate", () => {
  it("publishes keys the server vault holds", async () => {
    await sign_in(vault_with(key_set("a")), vault_with(key_set("a")));

    expect(await publish_vaulted_prekey_bundle(vault_with(key_set("a")))).toBe(
      true,
    );
    expect(h.uploaded).toHaveLength(1);
  });

  it("refuses keys the server vault does not hold", async () => {
    await sign_in(vault_with(key_set("local")), vault_with(key_set("server")));

    expect(
      await publish_vaulted_prekey_bundle(vault_with(key_set("local"))),
    ).toBe(false);
    expect(h.uploaded).toHaveLength(0);
  });

  it("refuses when the server vault does not open with the session password", async () => {
    await sign_in(
      vault_with(key_set("a")),
      vault_with(key_set("a")),
      "a-newer-password",
    );

    expect(await publish_vaulted_prekey_bundle(vault_with(key_set("a")))).toBe(
      false,
    );
    expect(h.uploaded).toHaveLength(0);
  });

  it("refuses when the server vault cannot be read", async () => {
    await sign_in(vault_with(key_set("a")), vault_with(key_set("a")));
    h.get_failure = { error: "Bad gateway", code: "UNKNOWN_ERROR" };

    expect(await publish_vaulted_prekey_bundle(vault_with(key_set("a")))).toBe(
      false,
    );
    expect(h.uploaded).toHaveLength(0);
  });

  it("does not publish regenerated keys when the vault push fails", async () => {
    await sign_in(vault_with(null), vault_with(null));
    h.put_fails = true;

    expect(await ensure_ratchet_keys()).toBe(false);
    expect(h.put_calls).toBeGreaterThan(0);
    expect(h.uploaded).toHaveLength(0);
  });

  it("publishes regenerated keys only after the vault holds them", async () => {
    await sign_in(vault_with(null), vault_with(null));

    expect(await ensure_ratchet_keys()).toBe(true);
    expect(h.uploaded).toHaveLength(1);

    const saved = await decrypt_vault(
      h.server!.encrypted_vault,
      h.server!.vault_nonce,
      PASSWORD,
    );

    expect(saved.ratchet_identity_public).toBe(
      h.uploaded[0].ratchet_identity_public,
    );
  });
});

describe("unreadable server vault", () => {
  it("is unverified, not missing, on an unclassified error", async () => {
    await sign_in(vault_with(null), vault_with(null));
    h.get_failure = { error: "Service unavailable", code: "UNKNOWN_ERROR" };

    expect((await sync_vault_with_server()).status).toBe("unverified");
  });

  it("never regenerates keys when the server vault cannot be read", async () => {
    await sign_in(vault_with(null), vault_with(key_set("server")));
    h.get_failure = { error: "Service unavailable", code: "UNKNOWN_ERROR" };

    expect(await ensure_ratchet_keys()).toBe(false);
    expect(h.identity_regenerations).toBe(0);
    expect(h.put_calls).toBe(0);
  });

  it("never regenerates keys over a vault the session password cannot open", async () => {
    await sign_in(
      vault_with(null),
      vault_with(key_set("server")),
      "a-newer-password",
    );

    expect(await ensure_ratchet_keys()).toBe(false);
    expect(h.identity_regenerations).toBe(0);
    expect(h.put_calls).toBe(0);
  });
});

describe("adopting a newer server vault", () => {
  it("keeps the keys it replaces in memory", async () => {
    await sign_in(vault_with(key_set("memory")), vault_with(key_set("server")));

    const freshness = await sync_vault_with_server();

    expect(freshness.status).toBe("adopted");
    expect(h.state.vault?.ratchet_identity_public).toBe("ipub-server");
    expect(h.state.vault?.ratchet_previous_keys).toEqual([key_set("memory")]);
  });
});
