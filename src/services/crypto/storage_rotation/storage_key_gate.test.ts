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

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

interface ServerVault {
  encrypted_vault: string;
  vault_nonce: string;
  vault_sha256: string;
}

const server: {
  vault: ServerVault | null;
  online: boolean;
  conflicts: number;
  legacy: boolean;
} = { vault: null, online: true, conflicts: 0, legacy: false };

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
    get: async () => {
      if (!server.online) throw new TypeError("Failed to fetch");

      if (server.vault && server.legacy) {
        return {
          data: {
            encrypted_vault: server.vault.encrypted_vault,
            vault_nonce: server.vault.vault_nonce,
          },
        };
      }

      return server.vault
        ? { data: { ...server.vault } }
        : { error: "missing", code: "NOT_FOUND" };
    },
    put: async (_path: string, body: Record<string, string>) => {
      if (!server.online) throw new TypeError("Failed to fetch");
      if (server.conflicts > 0) {
        server.conflicts -= 1;

        return { error: "conflict", status: 409 };
      }
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
  store_vault_in_memory,
} from "../memory_key_store";
import { load_storage_write_key_bytes } from "../storage_write_key";
import {
  set_storage_key_runner,
  storage_key_waiter_count,
} from "../storage_key_gate";

import { prepare_storage_key_gate, run_vault_step } from "./background";

const PASSWORD = "Gate-Step-Passw0rd-31";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const LONG_TEST = { timeout: 180000 };

let password_key_b64: string;

function weak_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
    vault_format: 2,
    data_kek: password_key_b64,
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

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

interface Tracked {
  done: boolean;
  failed: unknown;
  bytes: Uint8Array | null;
  promise: Promise<void>;
}

function track_writer(): Tracked {
  const tracked: Tracked = {
    done: false,
    failed: null,
    bytes: null,
    promise: Promise.resolve(),
  };

  tracked.promise = load_storage_write_key_bytes().then(
    (bytes) => {
      tracked.done = true;
      tracked.bytes = bytes;
    },
    (caught) => {
      tracked.failed = caught ?? "rejected";
    },
  );

  return tracked;
}

async function unlock_weak_session(): Promise<void> {
  const vault = weak_vault();

  await put_server_vault(vault);
  prepare_storage_key_gate();
  await store_vault_in_memory(vault, PASSWORD, USER_ID);
}

describe("storage key gate", () => {
  beforeAll(async () => {
    const raw = await derive_encryption_key_from_passphrase(
      new TextEncoder().encode(PASSWORD),
      STORAGE_KDF_VERSION_LEGACY,
    );

    password_key_b64 = array_to_base64(raw);
  }, 120000);

  beforeEach(() => {
    server.vault = null;
    server.online = true;
    server.conflicts = 0;
    server.legacy = false;
    clear_vault_from_memory();
  });

  afterEach(() => {
    set_storage_key_runner(null);
    clear_vault_from_memory();
  });

  it("holds a save while offline and finishes it once the key is installed", LONG_TEST, async () => {
    await unlock_weak_session();
    server.online = false;

    const writer = track_writer();
    const offline = await run_vault_step(PASSWORD);

    await settle();

    expect(offline.status).toBe("skipped");
    expect(writer.done).toBe(false);
    expect(writer.failed).toBeNull();
    expect(storage_key_waiter_count()).toBeGreaterThan(0);

    server.online = true;

    const online = await run_vault_step(PASSWORD);

    await writer.promise;

    const stored = await read_server_vault();

    expect(online.status).toBe("rotated");
    expect(writer.failed).toBeNull();
    expect(writer.done).toBe(true);
    expect(stored.data_kek_random).toBe(true);
    expect(array_to_base64(writer.bytes!)).toBe(stored.data_kek);
    expect(array_to_base64(writer.bytes!)).not.toBe(password_key_b64);
  });

  it("holds a save through repeated conflicts and never uses the password key", LONG_TEST, async () => {
    await unlock_weak_session();
    server.conflicts = 100;

    const writer = track_writer();
    const conflicted = await run_vault_step(PASSWORD);

    await settle();

    expect(conflicted.status).toBe("skipped");
    expect(writer.done).toBe(false);
    expect(writer.failed).toBeNull();

    server.conflicts = 0;

    const online = await run_vault_step(PASSWORD);

    await writer.promise;

    expect(online.status).toBe("rotated");
    expect(writer.failed).toBeNull();
    expect(array_to_base64(writer.bytes!)).not.toBe(password_key_b64);
    expect(array_to_base64(writer.bytes!)).toBe(
      (await read_server_vault()).data_kek,
    );
  });

  it("releases saves when the server cannot take a guarded write", LONG_TEST, async () => {
    await unlock_weak_session();
    server.legacy = true;

    const writer = track_writer();
    const outcome = await run_vault_step(PASSWORD);

    await writer.promise;

    expect(outcome).toEqual({ status: "skipped", reason: "unsupported" });
    expect(writer.failed).toBeNull();
    expect(writer.done).toBe(true);
    expect(array_to_base64(writer.bytes!)).toBe(password_key_b64);
  });

  it("does not hold saves when no unlock registered the step", LONG_TEST, async () => {
    const vault = weak_vault();

    set_storage_key_runner(null);
    await store_vault_in_memory(vault, PASSWORD, USER_ID);

    const writer = track_writer();

    await writer.promise;

    expect(writer.done).toBe(true);
    expect(array_to_base64(writer.bytes!)).toBe(password_key_b64);
  });
});
