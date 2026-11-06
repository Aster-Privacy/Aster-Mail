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

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ServerVault {
  encrypted_vault: string;
  vault_nonce: string;
  vault_sha256: string;
}

const server: {
  vault: ServerVault | null;
  puts: number;
  conflicts: number;
  legacy: boolean;
  bodies: Record<string, unknown>[];
  before_put?: () => Promise<void>;
} = { vault: null, puts: 0, conflicts: 0, legacy: false, bodies: [] };

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
      if (!server.vault) return { error: "missing", code: "NOT_FOUND" };
      if (server.legacy) {
        return {
          data: {
            encrypted_vault: server.vault.encrypted_vault,
            vault_nonce: server.vault.vault_nonce,
          },
        };
      }

      return { data: { ...server.vault } };
    },
    put: async (_path: string, body: Record<string, string>) => {
      server.bodies.push(body);
      if (server.before_put) {
        const hook = server.before_put;

        server.before_put = undefined;
        await hook();
      }
      if (server.conflicts > 0) {
        server.conflicts -= 1;

        return { error: "conflict", status: 409 };
      }
      if (
        !server.legacy &&
        server.vault &&
        body.expected_vault_sha256 !== server.vault.vault_sha256
      ) {
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

vi.mock("./vault_key_fingerprints", () => ({
  collect_vault_key_fingerprints: async () => [],
}));

import { decrypt_vault, encrypt_vault } from "./key_manager";
import {
  clear_vault_from_memory,
  get_vault_from_memory,
} from "./memory_key_store";
import {
  MAX_VAULT_CONFLICT_RETRIES,
  merge_vault_for_write,
  write_vault_merged,
} from "./vault_cas_write";

const PASSWORD = "Vault-Cas-Passw0rd-23";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const LONG_TEST = { timeout: 120000 };
const RANDOM_KEK = "cmFuZG9tLWRhdGEta2VrLWZvci10ZXN0cy0wMDAwMDA=";
const WEAK_KEK = "cGFzc3dvcmQtZGVyaXZlZC1rZWstZm9yLXRlc3RzMDA=";

function base_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
  };
}

function random_server_vault(): EncryptedVault {
  return {
    ...base_vault(),
    vault_format: 2,
    data_kek: RANDOM_KEK,
    data_kek_random: true,
    legacy_keks: [{ k: WEAK_KEK, added_at: "2026-11-01T00:00:00.000Z" }],
    storage_rekey: { state: "pending", started_at: "2026-11-01T00:00:00.000Z" },
    ...({ future_field: "kept" } as object),
  };
}

function stale_local_vault(): EncryptedVault {
  return { ...base_vault(), vault_format: 2, data_kek: WEAK_KEK };
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

describe("merge_vault_for_write", () => {
  it("never replaces a random server key with a local copy without one", () => {
    const local = stale_local_vault();
    const merged = merge_vault_for_write(
      random_server_vault(),
      local,
      { ...local, identity_key: "identity-2" },
      false,
    );

    expect(merged.data_kek).toBe(RANDOM_KEK);
    expect(merged.data_kek_random).toBe(true);
    expect(merged.storage_rekey?.state).toBe("pending");
    expect(merged.identity_key).toBe("identity-2");
  });

  it("keeps the random server key even for a storage-key owner", () => {
    const local = stale_local_vault();
    const merged = merge_vault_for_write(
      random_server_vault(),
      null,
      { ...local, data_kek: "b3RoZXIta2V5", data_kek_random: undefined },
      true,
    );

    expect(merged.data_kek).toBe(RANDOM_KEK);
    expect(merged.data_kek_random).toBe(true);
  });

  it("keeps legacy keks, unknown fields and the highest vault format", () => {
    const server_copy = random_server_vault();
    const local = stale_local_vault();
    const merged = merge_vault_for_write(
      server_copy,
      local,
      {
        ...local,
        vault_format: 1,
        legacy_keks: [{ k: "bmV3LWtlaw==", added_at: "2026-11-02" }],
      },
    );
    const record = merged as unknown as Record<string, unknown>;

    expect(record.future_field).toBe("kept");
    expect(merged.vault_format).toBe(2);
    expect(merged.legacy_keks?.map((entry) => entry.k)).toEqual([
      WEAK_KEK,
      "bmV3LWtlaw==",
    ]);
  });

  it("only applies fields the caller changed", () => {
    const local = stale_local_vault();
    const server_copy = {
      ...random_server_vault(),
      ratchet_identity_public: "server-ratchet",
    };
    const merged = merge_vault_for_write(server_copy, local, {
      ...local,
      recovery_codes: ["a", "b"],
    });

    expect(merged.ratchet_identity_public).toBe("server-ratchet");
    expect(merged.recovery_codes).toEqual(["a", "b"]);
  });
});

describe("write_vault_merged", () => {
  beforeEach(() => {
    server.vault = null;
    server.puts = 0;
    server.conflicts = 0;
    server.legacy = false;
    server.bodies = [];
    server.before_put = undefined;
    clear_vault_from_memory();
  });

  afterEach(() => {
    clear_vault_from_memory();
  });

  it("merges onto the server copy and sends the expected hash", LONG_TEST, async () => {
    await put_server_vault(random_server_vault());

    const sha_before = server.vault?.vault_sha256;
    const local = stale_local_vault();
    const result = await write_vault_merged({
      next: { ...local, recovery_codes: ["c1"] },
      base: local,
      passphrase: PASSWORD,
      user_id: USER_ID,
    });
    const stored = await read_server_vault();

    expect(result.status).toBe("written");
    expect(server.bodies[0].expected_vault_sha256).toBe(sha_before);
    expect(stored.data_kek).toBe(RANDOM_KEK);
    expect(stored.data_kek_random).toBe(true);
    expect(stored.recovery_codes).toEqual(["c1"]);
    expect((stored as unknown as Record<string, unknown>).future_field).toBe(
      "kept",
    );
    expect(get_vault_from_memory()?.data_kek).toBe(RANDOM_KEK);
  });

  it("re-reads and retries after a conflict", LONG_TEST, async () => {
    await put_server_vault(stale_local_vault());

    const local = stale_local_vault();

    server.before_put = async () => {
      await put_server_vault({
        ...random_server_vault(),
        ratchet_identity_public: "other-device",
      });
    };

    const result = await write_vault_merged({
      next: { ...local, recovery_codes: ["c2"] },
      base: local,
      passphrase: PASSWORD,
      user_id: USER_ID,
    });
    const stored = await read_server_vault();

    expect(result.status).toBe("written");
    expect(server.bodies.length).toBe(2);
    expect(stored.ratchet_identity_public).toBe("other-device");
    expect(stored.data_kek).toBe(RANDOM_KEK);
    expect(stored.recovery_codes).toEqual(["c2"]);
  });

  it("gives up after a bounded number of conflicts", LONG_TEST, async () => {
    await put_server_vault(stale_local_vault());
    server.conflicts = 100;

    const local = stale_local_vault();
    const result = await write_vault_merged({
      next: { ...local, recovery_codes: ["c3"] },
      base: local,
      passphrase: PASSWORD,
      user_id: USER_ID,
    });

    expect(result.status).toBe("conflict");
    expect(server.bodies.length).toBe(MAX_VAULT_CONFLICT_RETRIES + 1);
    expect(server.puts).toBe(0);
  });

  it("writes without a hash to a server that sends none", LONG_TEST, async () => {
    await put_server_vault(stale_local_vault());
    server.legacy = true;

    const local = stale_local_vault();
    const result = await write_vault_merged({
      next: { ...local, recovery_codes: ["c4"] },
      base: local,
      passphrase: PASSWORD,
      user_id: USER_ID,
    });

    expect(result.status).toBe("written");
    expect("expected_vault_sha256" in server.bodies[0]).toBe(false);
  });

  it("refuses a different account", async () => {
    const local = stale_local_vault();
    const result = await write_vault_merged({
      next: local,
      base: local,
      passphrase: PASSWORD,
      user_id: "99999999-2222-4333-8444-555555555555",
    });

    expect(result).toEqual({ status: "failed", error: "account_changed" });
    expect(server.bodies.length).toBe(0);
  });
});

const SRC_ROOT = join(process.cwd(), "src");
const HELPER_FILE = join("services", "crypto", "vault_cas_write.ts");
const VAULT_WRITE_PATTERNS = [
  /\.(put|post|patch)\s*(<[^>]*>)?\s*\(\s*["'`][^"'`]*\/keys\/vault["'`]/,
  /\.(put|post|patch)\s*(<[^>]*>)?\s*\(\s*VAULT_PATH\b/,
  /fetch\s*\([^)]*\/keys\/vault["'`][\s\S]{0,200}method\s*:\s*["'`](PUT|POST|PATCH)/i,
];

function source_files(dir: string): string[] {
  const found: string[] = [];

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);

    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      found.push(...source_files(full));
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.test\.(ts|tsx)$/.test(name) &&
      !name.endsWith(".d.ts")
    ) {
      found.push(full);
    }
  }

  return found;
}

describe("vault write routing", () => {
  it("sends every vault write through the merge helper", () => {
    const offenders = source_files(SRC_ROOT)
      .map((file) => relative(SRC_ROOT, file))
      .filter((file) => file !== HELPER_FILE)
      .filter((file) => {
        const text = readFileSync(join(SRC_ROOT, file), "utf8");

        return VAULT_WRITE_PATTERNS.some((pattern) => pattern.test(text));
      })
      .map((file) => file.split(sep).join("/"));

    expect(offenders).toEqual([]);
  });

  it("finds the helper's own write", () => {
    const text = readFileSync(join(SRC_ROOT, HELPER_FILE), "utf8");

    expect(VAULT_WRITE_PATTERNS.some((pattern) => pattern.test(text))).toBe(
      true,
    );
  });
});
