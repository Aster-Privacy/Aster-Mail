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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

interface ServerVault {
  encrypted_vault: string;
  vault_nonce: string;
  vault_sha256: string;
}

const server: { vault: ServerVault | null; puts: number; before_put?: () => Promise<void> } = {
  vault: null,
  puts: 0,
};

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
    user: { id: "11111111-2222-4333-8444-555555555555" },
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: async () =>
      server.vault ? { data: { ...server.vault } } : { error: "missing", status: 404 },
    put: async (_path: string, body: Record<string, string>) => {
      if (server.before_put) {
        const hook = server.before_put;

        server.before_put = undefined;
        await hook();
      }
      if (!server.vault || body.expected_vault_sha256 !== server.vault.vault_sha256) {
        return { error: "conflict", status: 409 };
      }
      server.puts += 1;
      server.vault = {
        encrypted_vault: body.encrypted_vault,
        vault_nonce: body.vault_nonce,
        vault_sha256: await sha_of(body.encrypted_vault),
      };

      return { data: { success: true } };
    },
  },
}));

vi.mock("../vault_key_fingerprints", () => ({
  collect_vault_key_fingerprints: async () => [],
}));

import { array_to_base64 } from "../base64";
import { decrypt_vault, encrypt_vault } from "../key_manager";
import {
  STORAGE_KDF_VERSION_LEGACY,
  clear_vault_from_memory,
  derive_encryption_key_from_passphrase,
  get_vault_from_memory,
} from "../memory_key_store";
import {
  ensure_random_storage_key,
  mark_storage_rekey_done,
  server_storage_key_matches,
} from "./vault_step";

const PASSWORD = "Vault-Step-Passw0rd-19";
const LONG_TEST = { timeout: 120000 };

let password_key_b64: string;

function base_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
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

function weak_vault(): EncryptedVault {
  return {
    ...base_vault(),
    vault_format: 2,
    data_kek: password_key_b64,
  };
}

function random_vault(): EncryptedVault {
  return {
    ...base_vault(),
    vault_format: 2,
    data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
    data_kek_random: true,
  };
}

describe("storage key vault step", () => {
  beforeAll(async () => {
    const raw = await derive_encryption_key_from_passphrase(
      new TextEncoder().encode(PASSWORD),
      STORAGE_KDF_VERSION_LEGACY,
    );

    password_key_b64 = array_to_base64(raw);
  }, 120000);

  beforeEach(() => {
    server.vault = null;
    server.puts = 0;
    server.before_put = undefined;
    clear_vault_from_memory();
  });

  afterEach(() => {
    clear_vault_from_memory();
  });

  it("rotates a password-derived storage key", LONG_TEST, async () => {
    await put_server_vault(weak_vault());

    const outcome = await ensure_random_storage_key(PASSWORD);
    const stored = await read_server_vault();

    expect(outcome.status).toBe("rotated");
    expect(server.puts).toBe(1);
    expect(stored.data_kek_random).toBe(true);
    expect(stored.data_kek).not.toBe(password_key_b64);
    expect(stored.legacy_keks?.map((entry) => entry.k)).toContain(
      password_key_b64,
    );
    expect(stored.storage_rekey?.state).toBe("pending");
    expect(stored.identity_key).toBe("identity");
    expect(get_vault_from_memory()?.data_kek).toBe(stored.data_kek);
  });

  it("leaves a random storage key untouched", LONG_TEST, async () => {
    const vault = random_vault();

    await put_server_vault(vault);

    const sha_before = server.vault?.vault_sha256;
    const outcome = await ensure_random_storage_key(PASSWORD);

    expect(outcome.status).toBe("current");
    expect(server.puts).toBe(0);
    expect(server.vault?.vault_sha256).toBe(sha_before);
    expect(get_vault_from_memory()?.data_kek).toBe(vault.data_kek);
  });

  it("adopts the vault another device rotated first", LONG_TEST, async () => {
    await put_server_vault(weak_vault());

    const other_device = random_vault();

    server.before_put = () => put_server_vault(other_device);

    const outcome = await ensure_random_storage_key(PASSWORD);
    const stored = await read_server_vault();

    expect(outcome.status).toBe("adopted");
    expect(server.puts).toBe(0);
    expect(stored.data_kek).toBe(other_device.data_kek);
    expect(get_vault_from_memory()?.data_kek).toBe(other_device.data_kek);
  });

  it("retries a conflicting write against the fresh vault", LONG_TEST, async () => {
    await put_server_vault(weak_vault());

    const edited = { ...weak_vault(), signed_prekey: "prekey-edited" };

    server.before_put = () => put_server_vault(edited);

    const outcome = await ensure_random_storage_key(PASSWORD);
    const stored = await read_server_vault();

    expect(outcome.status).toBe("rotated");
    expect(server.puts).toBe(1);
    expect(stored.signed_prekey).toBe("prekey-edited");
    expect(stored.data_kek_random).toBe(true);
  });

  it("marks a pending rekey done and reports a newer key", LONG_TEST, async () => {
    await put_server_vault(weak_vault());
    await ensure_random_storage_key(PASSWORD);

    const rotated = await read_server_vault();
    const data_kek = rotated.data_kek ?? "";

    expect(await server_storage_key_matches(PASSWORD, data_kek)).toBe(true);
    expect(await mark_storage_rekey_done(PASSWORD, data_kek)).toBe("done");

    const finished = await read_server_vault();

    expect(finished.storage_rekey?.state).toBe("done");
    expect(finished.data_kek).toBe(data_kek);

    const puts = server.puts;

    expect(await mark_storage_rekey_done(PASSWORD, data_kek)).toBe("done");
    expect(server.puts).toBe(puts);

    const newer = random_vault();

    await put_server_vault(newer);
    expect(await server_storage_key_matches(PASSWORD, data_kek)).toBe(false);
    expect(await mark_storage_rekey_done(PASSWORD, data_kek)).toBe("superseded");
    expect(get_vault_from_memory()?.data_kek).toBe(newer.data_kek);
  });
});
