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
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault_in_memory: true,
  writes_ready: true,
  retired: false,
  seal_key: {} as CryptoKey | null,
  created_key: {} as CryptoKey | null,
  pq_ok: true,
  ec_ok: true,
  pq_unopenable: [] as number[],
  ec_unopenable: [] as number[],
  retire: vi.fn(async () => true),
  create_key: vi.fn(),
  reseal_pq: vi.fn(),
  reseal_ec: vi.fn(),
  drop_ec: vi.fn(async (_key_id: number) => true),
  delete_pq: vi.fn(async (_key_id: number) => true),
  replenish_ec: vi.fn(async () => 1),
  upload_pq: vi.fn(async () => true),
  replace_signed: vi.fn(async () => true),
}));

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => h.vault_in_memory,
}));

vi.mock("./prekey_seal", () => ({
  prekey_seal_writes_ready: async () => h.writes_ready,
  load_prekey_seal_key: async () => h.seal_key,
  create_prekey_seal_key: h.create_key,
  ensure_prekey_seal_key: async () => h.seal_key ?? h.create_key(),
  legacy_prekey_seals_retired: () => h.retired,
  retire_legacy_prekey_seals: h.retire,
}));

vi.mock("./pq_prekey_store", () => ({
  reseal_server_pq_secrets: h.reseal_pq,
  drop_server_pq_secret: h.delete_pq,
}));

vi.mock("./ec_prekey_store", () => ({
  reseal_server_ec_secrets: h.reseal_ec,
  drop_server_ec_secret: h.drop_ec,
}));

vi.mock("./ec_prekey_service", () => ({
  replenish_ec_one_time_prekeys: h.replenish_ec,
}));

vi.mock("./prekey_service", () => ({
  generate_and_upload_prekeys: h.upload_pq,
}));

vi.mock("./signed_prekey_rotation", () => ({
  replace_signed_prekey: h.replace_signed,
}));

import * as migration from "./prekey_seal_migration";

const { migrate_prekey_seals } = migration;

function reset_failures(): void {
  const reset = (migration as Record<string, unknown>)
    .reset_prekey_seal_open_failures;

  if (typeof reset === "function") reset();
}

beforeEach(() => {
  h.vault_in_memory = true;
  h.writes_ready = true;
  h.retired = false;
  h.seal_key = {} as CryptoKey;
  h.created_key = {} as CryptoKey;
  h.pq_ok = true;
  h.ec_ok = true;
  h.pq_unopenable = [];
  h.ec_unopenable = [];
  for (const mock of [
    h.retire,
    h.drop_ec,
    h.delete_pq,
    h.replenish_ec,
    h.upload_pq,
    h.replace_signed,
  ]) {
    mock.mockClear();
  }
  h.drop_ec.mockImplementation(async () => true);
  h.delete_pq.mockImplementation(async () => true);
  h.create_key.mockReset();
  h.create_key.mockImplementation(async () => {
    h.seal_key = h.created_key;

    return h.created_key;
  });
  h.reseal_pq.mockReset();
  h.reseal_ec.mockReset();
  h.reseal_pq.mockImplementation(
    async (_key: unknown, on_unopenable?: (key_id: number) => void) => {
      for (const key_id of h.pq_unopenable) on_unopenable?.(key_id);

      return h.pq_ok;
    },
  );
  h.reseal_ec.mockImplementation(
    async (_key: unknown, on_unopenable?: (key_id: number) => void) => {
      for (const key_id of h.ec_unopenable) on_unopenable?.(key_id);

      return h.ec_ok;
    },
  );
  reset_failures();
});

describe("prekey seal migration", () => {
  it("re-seals both stores and then retires the old format", async () => {
    expect(await migrate_prekey_seals()).toBe(true);
    expect(h.reseal_pq.mock.calls[0][0]).toBe(h.seal_key);
    expect(h.reseal_ec.mock.calls[0][0]).toBe(h.seal_key);
    expect(h.retire).toHaveBeenCalledTimes(1);
  });

  it("keeps the old format open when either store did not finish", async () => {
    h.ec_ok = false;
    expect(await migrate_prekey_seals()).toBe(false);

    h.ec_ok = true;
    h.pq_ok = false;
    expect(await migrate_prekey_seals()).toBe(false);

    expect(h.retire).not.toHaveBeenCalled();
  });

  it("does nothing more once the old format is retired", async () => {
    h.retired = true;

    expect(await migrate_prekey_seals()).toBe(true);
    expect(h.reseal_pq).not.toHaveBeenCalled();
    expect(h.reseal_ec).not.toHaveBeenCalled();
    expect(h.retire).not.toHaveBeenCalled();
  });

  it("repeats an unfinished run without retiring early", async () => {
    h.pq_ok = false;
    expect(await migrate_prekey_seals()).toBe(false);

    h.pq_ok = true;
    expect(await migrate_prekey_seals()).toBe(true);

    expect(h.retire).toHaveBeenCalledTimes(1);
  });

  it("does not run without a vault", async () => {
    h.vault_in_memory = false;
    expect(await migrate_prekey_seals()).toBe(false);

    expect(h.reseal_pq).not.toHaveBeenCalled();
  });

  it("runs one migration at a time", async () => {
    const [first, second] = await Promise.all([
      migrate_prekey_seals(),
      migrate_prekey_seals(),
    ]);

    expect(first && second).toBe(true);
    expect(h.retire).toHaveBeenCalledTimes(1);
  });

  it("leaves every row alone until the server is ready for the new format", async () => {
    h.writes_ready = false;
    h.seal_key = null;

    await migrate_prekey_seals();

    expect(h.create_key).not.toHaveBeenCalled();
    expect(h.reseal_pq).not.toHaveBeenCalled();
    expect(h.reseal_ec).not.toHaveBeenCalled();
    expect(h.retire).not.toHaveBeenCalled();
  });

  it("keeps the old format open while a row fails to open", async () => {
    h.ec_unopenable = [5];

    expect(await migrate_prekey_seals()).toBe(false);
    expect(await migrate_prekey_seals()).toBe(false);

    expect(h.retire).not.toHaveBeenCalled();
    expect(h.drop_ec).not.toHaveBeenCalled();
  });

  it("replaces a row that failed to open three times and only then retires", async () => {
    h.ec_unopenable = [5];
    h.pq_unopenable = [9];

    expect(await migrate_prekey_seals()).toBe(false);
    expect(await migrate_prekey_seals()).toBe(false);
    expect(h.retire).not.toHaveBeenCalled();

    expect(await migrate_prekey_seals()).toBe(true);

    expect(h.drop_ec).toHaveBeenCalledWith(5);
    expect(h.delete_pq).toHaveBeenCalledWith(9);
    expect(h.replenish_ec).toHaveBeenCalledTimes(1);
    expect(h.upload_pq).toHaveBeenCalledWith(true);
    expect(h.retire).toHaveBeenCalledTimes(1);
  });

  it("forgets a failure once the row opens again", async () => {
    h.ec_unopenable = [5];
    expect(await migrate_prekey_seals()).toBe(false);
    expect(await migrate_prekey_seals()).toBe(false);

    h.ec_unopenable = [];
    expect(await migrate_prekey_seals()).toBe(true);

    expect(h.drop_ec).not.toHaveBeenCalled();
  });

  it("rotates every unreadable prekey and the signed prekey after the seal key is lost", async () => {
    h.seal_key = null;
    h.ec_unopenable = [5];
    h.pq_unopenable = [9];
    h.drop_ec.mockImplementation(async (key_id: number) => {
      h.ec_unopenable = h.ec_unopenable.filter((id) => id !== key_id);

      return true;
    });
    h.delete_pq.mockImplementation(async (key_id: number) => {
      h.pq_unopenable = h.pq_unopenable.filter((id) => id !== key_id);

      return true;
    });

    expect(await migrate_prekey_seals()).toBe(true);

    expect(h.reseal_ec.mock.calls[0][0]).toBeNull();
    expect(h.create_key).toHaveBeenCalledTimes(1);
    expect(h.drop_ec).toHaveBeenCalledWith(5);
    expect(h.delete_pq).toHaveBeenCalledWith(9);
    expect(h.replenish_ec).toHaveBeenCalledTimes(1);
    expect(h.upload_pq).toHaveBeenCalledWith(true);
    expect(h.replace_signed).toHaveBeenCalledTimes(1);
    expect(h.retire).toHaveBeenCalledTimes(1);
  });

  it("stops the rotation when the server keeps a row it was asked to remove", async () => {
    h.seal_key = null;
    h.ec_unopenable = [5];
    h.drop_ec.mockImplementation(async () => false);

    expect(await migrate_prekey_seals()).toBe(false);

    expect(h.drop_ec).toHaveBeenCalledWith(5);
    expect(h.replenish_ec).not.toHaveBeenCalled();
    expect(h.replace_signed).not.toHaveBeenCalled();
    expect(h.retire).not.toHaveBeenCalled();
  });

  it("keeps every row when another device's seal key wins the write and opens them", async () => {
    const winning_key = {} as CryptoKey;

    h.seal_key = null;
    h.ec_unopenable = [5];
    h.pq_unopenable = [9];
    h.create_key.mockImplementation(async () => {
      h.seal_key = winning_key;
      h.ec_unopenable = [];
      h.pq_unopenable = [];

      return winning_key;
    });

    expect(await migrate_prekey_seals()).toBe(true);

    expect(h.reseal_ec.mock.calls[1][0]).toBe(winning_key);
    expect(h.drop_ec).not.toHaveBeenCalled();
    expect(h.delete_pq).not.toHaveBeenCalled();
    expect(h.replace_signed).not.toHaveBeenCalled();
    expect(h.retire).toHaveBeenCalledTimes(1);
  });

  it("replaces only the rows that the winning seal key still cannot open", async () => {
    const winning_key = {} as CryptoKey;

    h.seal_key = null;
    h.ec_unopenable = [5, 6];
    h.create_key.mockImplementation(async () => {
      h.seal_key = winning_key;
      h.ec_unopenable = [6];

      return winning_key;
    });
    h.drop_ec.mockImplementation(async (key_id: number) => {
      h.ec_unopenable = h.ec_unopenable.filter((id) => id !== key_id);

      return true;
    });

    expect(await migrate_prekey_seals()).toBe(true);

    expect(h.drop_ec).toHaveBeenCalledTimes(1);
    expect(h.drop_ec).toHaveBeenCalledWith(6);
    expect(h.replace_signed).toHaveBeenCalledTimes(1);
  });

  it("creates a seal key without a rotation when every row still opens", async () => {
    h.seal_key = null;

    expect(await migrate_prekey_seals()).toBe(true);

    expect(h.reseal_ec.mock.calls[0][0]).toBeNull();
    expect(h.create_key).toHaveBeenCalledTimes(1);
    expect(h.replace_signed).not.toHaveBeenCalled();
    expect(h.drop_ec).not.toHaveBeenCalled();
  });

  it("does not hold up unlock while the migration runs", async () => {
    let release: (done: boolean) => void = () => undefined;

    h.reseal_pq.mockImplementation(
      () => new Promise<boolean>((resolve) => (release = resolve)),
    );

    const start = (migration as Record<string, unknown>)
      .start_prekey_seal_migration;

    expect(typeof start).toBe("function");
    expect((start as () => unknown)()).toBeUndefined();

    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../contexts/auth/vault_decryption.ts",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/await\s+migrate_prekey_seals\(/);
    expect(source).toMatch(/start_prekey_seal_migration\(\)/);

    release(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
