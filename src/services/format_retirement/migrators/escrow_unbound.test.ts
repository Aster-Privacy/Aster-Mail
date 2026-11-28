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
import type { EscrowRow } from "@/services/crypto/storage_rotation/steps_escrow";
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { RunnerDeps } from "../runner";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => null,
  get_vault_from_memory: () => null,
  has_vault_in_memory: () => true,
}));

vi.mock("@/services/api/client", () => ({
  api_client: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: async () => ({ bound_escrow_writes: true }),
}));

import { reset_runner_state, run_format_migrations } from "../runner";
import { record_has_format, with_format_retired } from "../record";

import {
  classify_escrow_row,
  create_escrow_unbound_migrator,
  type EscrowUnboundDeps,
} from "./escrow_unbound";

import { array_to_base64 } from "@/services/crypto/base64";
import { escrow_aad_v2 } from "@/services/crypto/message_escrow";
import { try_open } from "@/services/crypto/storage_rotation/reseal_keys";

async function aes_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(
  key: CryptoKey,
  message_id: string,
  text: string,
  aad?: Uint8Array,
): Promise<EscrowRow> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = aad
    ? { name: "AES-GCM", iv: nonce, additionalData: aad }
    : { name: "AES-GCM", iv: nonce };
  const sealed = await crypto.subtle.encrypt(
    params,
    key,
    new TextEncoder().encode(text),
  );

  return {
    message_id,
    encrypted_plaintext: array_to_base64(new Uint8Array(sealed)),
    plaintext_nonce: array_to_base64(nonce),
  };
}

interface Server {
  rows: Map<string, EscrowRow>;
  failing: Set<string>;
  upserts: number;
}

function server_deps(
  server: Server,
  key: CryptoKey,
  legacy: CryptoKey,
): EscrowUnboundDeps {
  return {
    async list_page(cursor, limit) {
      const all = [...server.rows.values()];
      const start = cursor ? Number(cursor) : 0;
      const end = start + limit;

      return {
        entries: all.slice(start, end).map((row) => ({ ...row })),
        next_cursor: end < all.length ? String(end) : null,
      };
    },
    async upsert(row) {
      if (server.failing.has(row.message_id)) throw new Error("quota");
      server.upserts += 1;
      server.rows.set(row.message_id, row);
    },
    escrow_key: async () => key,
    open_legacy_unbound: (ciphertext, nonce) =>
      try_open(legacy, ciphertext, nonce),
  };
}

function runner_deps(): { deps: RunnerDeps; vault: () => EncryptedVault } {
  let vault = {} as EncryptedVault;

  return {
    vault: () => vault,
    deps: {
      get_vault: () => vault,
      is_active: () => true,
      write_marker: async (_user, id, version) => {
        vault = {
          ...vault,
          format_retirements: with_format_retired(vault, id, version, 0),
        };

        return true;
      },
      sleep: async () => undefined,
    },
  };
}

async function open_text(
  key: CryptoKey,
  row: EscrowRow,
  aad?: Uint8Array,
): Promise<string | null> {
  const opened = await try_open(
    key,
    Uint8Array.from(atob(row.encrypted_plaintext), (c) => c.charCodeAt(0)),
    Uint8Array.from(atob(row.plaintext_nonce), (c) => c.charCodeAt(0)),
    aad,
  );

  return opened ? new TextDecoder().decode(opened) : null;
}

beforeEach(() => reset_runner_state());

describe("escrow_unbound migrator", () => {
  it("rebinds unbound rows, keeps them readable, and marks", async () => {
    const key = await aes_key();
    const legacy = await aes_key();
    const server: Server = { rows: new Map(), failing: new Set(), upserts: 0 };

    server.rows.set("v3:a", await seal(key, "v3:a", "three"));
    server.rows.set(
      "m-bound",
      await seal(key, "m-bound", "bound", escrow_aad_v2("m-bound")),
    );
    server.rows.set("m-plain", await seal(key, "m-plain", "plain"));
    server.rows.set("m-legacy", await seal(legacy, "m-legacy", "legacy"));

    const migrator = create_escrow_unbound_migrator(
      server_deps(server, key, legacy),
    );
    const run = runner_deps();
    const summary = await run_format_migrations("u1", run.deps, {
      migrators: [migrator],
      batch_size: 2,
    });

    expect(summary.outcomes.escrow_unbound).toBe("marked");
    expect(server.upserts).toBe(2);
    expect(record_has_format(run.vault(), "escrow_unbound")).toBe(true);

    for (const [id, text] of [
      ["m-plain", "plain"],
      ["m-legacy", "legacy"],
      ["m-bound", "bound"],
    ]) {
      const row = server.rows.get(id) as EscrowRow;

      expect(await open_text(key, row, escrow_aad_v2(id))).toBe(text);
      expect(await open_text(key, row)).toBeNull();
    }
  });

  it("is idempotent once every row is bound", async () => {
    const key = await aes_key();
    const legacy = await aes_key();
    const server: Server = { rows: new Map(), failing: new Set(), upserts: 0 };

    server.rows.set("m-plain", await seal(key, "m-plain", "plain"));

    const migrator = create_escrow_unbound_migrator(
      server_deps(server, key, legacy),
    );

    await run_format_migrations("u1", runner_deps().deps, {
      migrators: [migrator],
    });
    reset_runner_state();
    await run_format_migrations("u1", runner_deps().deps, {
      migrators: [migrator],
    });

    expect(server.upserts).toBe(1);
  });

  it("leaves the original row untouched when its write fails", async () => {
    const key = await aes_key();
    const legacy = await aes_key();
    const server: Server = { rows: new Map(), failing: new Set(), upserts: 0 };
    const original = await seal(key, "m-plain", "plain");

    server.rows.set("m-plain", original);
    server.failing.add("m-plain");

    const run = runner_deps();
    const summary = await run_format_migrations("u1", run.deps, {
      migrators: [
        create_escrow_unbound_migrator(server_deps(server, key, legacy)),
      ],
    });

    expect(summary.outcomes.escrow_unbound).toBe("incomplete");
    expect(server.rows.get("m-plain")).toEqual(original);
    expect(await open_text(key, original)).toBe("plain");
    expect(record_has_format(run.vault(), "escrow_unbound")).toBe(false);
  });

  it("counts a row another device left unbound after a stale listing", async () => {
    const key = await aes_key();
    const legacy = await aes_key();
    const server: Server = { rows: new Map(), failing: new Set(), upserts: 0 };
    const deps = server_deps(server, key, legacy);
    const migrator = create_escrow_unbound_migrator(deps);

    server.rows.set("m-late", await seal(key, "m-late", "late"));

    const ctx = {
      user_id: "u1",
      vault: {} as EncryptedVault,
      state: {},
      is_active: () => true,
    };

    expect(await migrator.count(ctx)).toBe(1);
    expect(
      (
        await classify_escrow_row(
          key,
          server.rows.get("m-late") as EscrowRow,
          deps,
        )
      ).kind,
    ).toBe("unbound");
  });

  it("defers when the escrow key is not available", async () => {
    const legacy = await aes_key();
    const server: Server = { rows: new Map(), failing: new Set(), upserts: 0 };
    const deps = {
      ...server_deps(server, legacy, legacy),
      escrow_key: async () => null,
    };
    const summary = await run_format_migrations("u1", runner_deps().deps, {
      migrators: [create_escrow_unbound_migrator(deps)],
    });

    expect(summary.outcomes.escrow_unbound).toBe("deferred");
  });
});
