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
import type { EncryptedVault } from "../key_manager_core";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

interface ServerVault {
  encrypted_vault: string;
  vault_nonce: string;
  vault_sha256: string;
}

const LOGIN_SALT = new Uint8Array(32).fill(21);
const server: { vault: ServerVault | null } = { vault: null };

async function sha_of(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({
    user: {
      id: "11111111-2222-4333-8444-555555555555",
      email: "login-key@astermail.org",
    },
  }),
}));

vi.mock("@/services/api/client", async () => {
  const { array_to_base64 } = await import("../base64");

  return {
    api_client: {
      get: async (path: string) => {
        if (path.includes("login-salt")) return { data: { retired_salts: [] } };

        return server.vault
          ? { data: { ...server.vault } }
          : { error: "missing", status: 404 };
      },
      post: async (path: string) =>
        path.includes("/auth/salt")
          ? { data: { salt: array_to_base64(LOGIN_SALT) } }
          : { error: "unexpected", status: 404 },
      put: async (_path: string, body: Record<string, string>) => {
        if (
          !server.vault ||
          body.expected_vault_sha256 !== server.vault.vault_sha256
        ) {
          return { error: "conflict", status: 409 };
        }
        server.vault = {
          encrypted_vault: body.encrypted_vault,
          vault_nonce: body.vault_nonce,
          vault_sha256: await sha_of(body.encrypted_vault),
        };

        return { data: { success: true } };
      },
    },
  };
});

vi.mock("../vault_key_fingerprints", () => ({
  collect_vault_key_fingerprints: async () => [],
}));

import { array_to_base64 } from "../base64";
import { decrypt_vault, encrypt_vault } from "../key_manager";
import { derive_password_hash } from "../key_manager_pgp_keygen";
import {
  STORAGE_KDF_VERSION_LEGACY,
  clear_vault_from_memory,
  derive_encryption_key_from_passphrase,
  get_vault_from_memory,
} from "../memory_key_store";
import { ensure_random_storage_key } from "./vault_step";

const PASSWORD = "Login-Key-Passw0rd-31";
const LONG_TEST = { timeout: 180000 };

let password_key_b64: string;
let login_hash_b64: string;

function base_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
    vault_format: 2,
  };
}

async function put_server_vault(vault: EncryptedVault): Promise<void> {
  const { encrypted_vault, vault_nonce } = await encrypt_vault(vault, PASSWORD);

  server.vault = {
    encrypted_vault,
    vault_nonce,
    vault_sha256: await sha_of(encrypted_vault),
  };
}

async function read_server_vault(): Promise<EncryptedVault> {
  if (!server.vault) throw new Error("no vault");

  return decrypt_vault(
    server.vault.encrypted_vault,
    server.vault.vault_nonce,
    PASSWORD,
  );
}

function kept_keys(vault: EncryptedVault | null): string[] {
  return [
    ...(vault?.legacy_keks ?? []).map((entry) => entry.k),
    ...(vault?.storage_rekey?.prior_keys ?? []),
  ];
}

describe("storage key rotation and the login proof", () => {
  beforeAll(async () => {
    password_key_b64 = array_to_base64(
      await derive_encryption_key_from_passphrase(
        new TextEncoder().encode(PASSWORD),
        STORAGE_KDF_VERSION_LEGACY,
      ),
    );
    login_hash_b64 = (await derive_password_hash(PASSWORD, LOGIN_SALT)).hash;
  }, 180000);

  beforeEach(() => {
    localStorage.clear();
    server.vault = null;
    clear_vault_from_memory();
  });

  it("never keeps the login proof as an older storage key", LONG_TEST, async () => {
    await put_server_vault({ ...base_vault(), data_kek: password_key_b64 });

    const outcome = await ensure_random_storage_key(PASSWORD);
    const stored = await read_server_vault();

    expect(outcome.status).toBe("rotated");
    expect(kept_keys(stored)).toContain(password_key_b64);
    expect(kept_keys(stored)).not.toContain(login_hash_b64);
    expect(kept_keys(get_vault_from_memory())).not.toContain(login_hash_b64);
  });

  it("drops a login proof an older client kept as a storage key", LONG_TEST, async () => {
    await put_server_vault({
      ...base_vault(),
      data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
      data_kek_random: true,
      legacy_keks: [
        { k: login_hash_b64, added_at: "2026-01-01T00:00:00Z" },
        { k: password_key_b64, added_at: "2026-01-01T00:00:00Z" },
      ],
    });

    await ensure_random_storage_key(PASSWORD);
    const stored = await read_server_vault();

    expect(kept_keys(stored)).not.toContain(login_hash_b64);
    expect(kept_keys(stored)).toContain(password_key_b64);
    expect(kept_keys(get_vault_from_memory())).not.toContain(login_hash_b64);
  });

  it("treats a storage key equal to the login proof as one to replace", LONG_TEST, async () => {
    await put_server_vault({
      ...base_vault(),
      data_kek: login_hash_b64,
      data_kek_random: true,
    });

    const outcome = await ensure_random_storage_key(PASSWORD);
    const stored = await read_server_vault();

    expect(outcome.status).toBe("rotated");
    expect(stored.data_kek).not.toBe(login_hash_b64);
    expect(kept_keys(stored)).not.toContain(login_hash_b64);
  });
});
