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
import type { EncryptedVault } from "./key_manager";
import type { VaultWorkFactorDeps } from "./vault_work_factor";

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  VAULT_WORK_FACTOR_BACKOFF_BASE_MS,
  VAULT_WORK_FACTOR_BACKOFF_MAX_MS,
  read_vault_work_factor_backoff,
  upgrade_vault_work_factor,
  vault_work_factor_backoff_ms,
} from "./vault_work_factor";
import {
  get_level2_admission,
  known_vault_kdf_iterations,
  mark_level2_admitted,
  reset_level2_state,
} from "./vault_level2";

const USER_ID = "user-1";
const VAULT = { identity_key: "id", data_kek: "kek" } as unknown as EncryptedVault;

function memory_store() {
  const map = new Map<string, string>();

  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function make_deps(
  iterations: number | null,
  put_result: () => Record<string, unknown> = () => ({ data: { success: true } }),
) {
  const store = memory_store();
  const server = { iterations };
  const fetch_vault = vi.fn(async () => ({
    data: {
      encrypted_vault: "old-vault",
      vault_nonce: "old-nonce",
      vault_format: 3,
      vault_sha256: "c2hh",
      vault_kdf_iterations: server.iterations,
    },
  }));
  const put_vault = vi.fn(async (body: Record<string, unknown>) => {
    const result = put_result();

    if (!result.error) {
      server.iterations = (body.vault_kdf_iterations as number | undefined) ?? 310000;
    }

    return result;
  });
  const encrypt = vi.fn(async (vault: EncryptedVault, _pw: string, it: number) => ({
    encrypted_vault: `sealed-${it}:${JSON.stringify(vault)}`,
    vault_nonce: "new-nonce",
  }));
  const decrypt = vi.fn(async (encrypted: string) =>
    encrypted.startsWith("sealed-")
      ? (JSON.parse(encrypted.slice(encrypted.indexOf(":") + 1)) as EncryptedVault)
      : VAULT,
  );
  const on_written = vi.fn(async () => {});
  const deps = {
    fetch_vault,
    put_vault,
    get_passphrase: () => "pass",
    decrypt,
    encrypt,
    key_fingerprints: async () => ["fp"],
    on_written,
    storage: () => store,
    now: () => clock.now,
  } as unknown as VaultWorkFactorDeps;

  return { deps, fetch_vault, put_vault, encrypt, on_written, store, server };
}

const clock = { now: 1_000_000 };

beforeEach(() => {
  reset_level2_state();
  clock.now = 1_000_000;
});

describe("upgrade_vault_work_factor", () => {
  it("rewraps a 310k vault at 600k with the CAS hash when admitted", async () => {
    mark_level2_admitted();
    const { deps, put_vault, encrypt, on_written } = make_deps(null);

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("upgraded");
    expect(encrypt).toHaveBeenCalledWith(VAULT, "pass", 600000);

    const body = (put_vault.mock.calls[0] as unknown[] | undefined)?.[0] as Record<string, unknown>;

    expect(body.vault_kdf_iterations).toBe(600000);
    expect(body.expected_vault_sha256).toBe("c2hh");
    expect(body.expected_user_id).toBe(USER_ID);
    expect(body.vault_format).toBe(3);
    expect(String(body.encrypted_vault)).toBe(
      `sealed-600000:${JSON.stringify(VAULT)}`,
    );
    expect(known_vault_kdf_iterations(String(body.encrypted_vault))).toBe(600000);
    expect(on_written).toHaveBeenCalledTimes(1);
    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("already");
    expect(put_vault).toHaveBeenCalledTimes(1);
  });

  it("upgrades again after another writer stores the vault at 310k", async () => {
    mark_level2_admitted();
    const { deps, put_vault, server } = make_deps(310000);

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("upgraded");
    expect(server.iterations).toBe(600000);

    server.iterations = 310000;

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("upgraded");
    expect(put_vault).toHaveBeenCalledTimes(2);
    expect(server.iterations).toBe(600000);
  });

  it("does nothing when the account is not admitted", async () => {
    const { deps, fetch_vault, put_vault } = make_deps(310000);

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("unavailable");
    expect(fetch_vault).not.toHaveBeenCalled();
    expect(put_vault).not.toHaveBeenCalled();
  });

  it("leaves a vault already at 600k alone", async () => {
    mark_level2_admitted();
    const { deps, put_vault, encrypt } = make_deps(600000);

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("already");
    expect(encrypt).not.toHaveBeenCalled();
    expect(put_vault).not.toHaveBeenCalled();
  });

  it("retries on a later pass after VAULT_CHANGED", async () => {
    mark_level2_admitted();
    let conflict = true;
    const { deps, put_vault } = make_deps(310000, () =>
      conflict
        ? { error: "vault_changed", status: 409, server_code: "VAULT_CHANGED" }
        : { data: { success: true } },
    );

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("changed");

    conflict = false;

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("upgraded");
    expect(put_vault).toHaveBeenCalledTimes(2);
  });

  it("stops without a 310k rewrite when the server refuses level 2", async () => {
    mark_level2_admitted();
    const { deps, put_vault } = make_deps(310000, () => ({
      error: "not admitted",
      status: 409,
      server_code: "VAULT_LEVEL2_NOT_ADMITTED",
    }));

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("refused");
    expect(put_vault).toHaveBeenCalledTimes(1);
    expect(get_level2_admission()).toBe("refused");
  });

  it("skips the write when the vault hash is missing", async () => {
    mark_level2_admitted();
    const { deps, fetch_vault, put_vault } = make_deps(310000);

    fetch_vault.mockResolvedValueOnce({
      data: {
        encrypted_vault: "old-vault",
        vault_nonce: "old-nonce",
        vault_format: 3,
        vault_sha256: undefined as unknown as string,
        vault_kdf_iterations: 310000,
      },
    });

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("unavailable");
    expect(put_vault).not.toHaveBeenCalled();
  });
});

describe("vault work factor backoff", () => {
  const HOUR = VAULT_WORK_FACTOR_BACKOFF_BASE_MS;

  function failing() {
    return make_deps(310000, () => ({ error: "server error", status: 500 }));
  }

  it("doubles from one hour and caps at seven days", () => {
    expect(HOUR).toBe(60 * 60 * 1000);
    expect(VAULT_WORK_FACTOR_BACKOFF_MAX_MS).toBe(7 * 24 * HOUR);
    expect(vault_work_factor_backoff_ms(1)).toBe(HOUR);
    expect(vault_work_factor_backoff_ms(2)).toBe(2 * HOUR);
    expect(vault_work_factor_backoff_ms(3)).toBe(4 * HOUR);
    expect(vault_work_factor_backoff_ms(8)).toBe(128 * HOUR);
    expect(vault_work_factor_backoff_ms(9)).toBe(7 * 24 * HOUR);
    expect(vault_work_factor_backoff_ms(50)).toBe(7 * 24 * HOUR);
  });

  it("waits out each failure window before trying again", async () => {
    mark_level2_admitted();
    const { deps, put_vault, store } = failing();

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("failed");
    expect(read_vault_work_factor_backoff(store, USER_ID)).toEqual({
      failures: 1,
      next_at: clock.now + HOUR,
    });

    clock.now += HOUR - 1;
    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("backoff");
    expect(put_vault).toHaveBeenCalledTimes(1);

    clock.now += 1;
    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("failed");
    expect(put_vault).toHaveBeenCalledTimes(2);
    expect(read_vault_work_factor_backoff(store, USER_ID)).toEqual({
      failures: 2,
      next_at: clock.now + 2 * HOUR,
    });

    clock.now += 2 * HOUR - 1;
    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("backoff");
    expect(put_vault).toHaveBeenCalledTimes(2);
  });

  it("keeps the window at seven days after many failures", async () => {
    mark_level2_admitted();
    const { deps, store } = failing();

    for (let i = 0; i < 12; i += 1) {
      expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("failed");
      const backoff = read_vault_work_factor_backoff(store, USER_ID);

      expect(backoff?.failures).toBe(i + 1);
      expect((backoff?.next_at ?? 0) - clock.now).toBe(
        Math.min(HOUR * 2 ** i, VAULT_WORK_FACTOR_BACKOFF_MAX_MS),
      );
      clock.now = backoff?.next_at ?? clock.now;
    }
  });

  it("clears the backoff after a later success", async () => {
    mark_level2_admitted();
    let fail = true;
    const { deps, store } = make_deps(310000, () =>
      fail ? { error: "server error", status: 500 } : { data: { success: true } },
    );

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("failed");
    fail = false;
    clock.now += HOUR;
    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("upgraded");
    expect(read_vault_work_factor_backoff(store, USER_ID)).toBeNull();
  });

  it("does not back off on a conflict or a refusal", async () => {
    mark_level2_admitted();
    const changed = make_deps(310000, () => ({
      error: "changed",
      status: 409,
      server_code: "VAULT_CHANGED",
    }));

    expect(await upgrade_vault_work_factor(USER_ID, changed.deps)).toBe("changed");
    expect(read_vault_work_factor_backoff(changed.store, USER_ID)).toBeNull();
    expect(await upgrade_vault_work_factor(USER_ID, changed.deps)).toBe("changed");
    expect(changed.put_vault).toHaveBeenCalledTimes(2);

    const refused = make_deps(310000, () => ({
      error: "not admitted",
      status: 409,
      server_code: "VAULT_LEVEL2_NOT_ADMITTED",
    }));

    expect(await upgrade_vault_work_factor(USER_ID, refused.deps)).toBe("refused");
    expect(read_vault_work_factor_backoff(refused.store, USER_ID)).toBeNull();
  });

  it("keeps the backoff per account", async () => {
    mark_level2_admitted();
    const { deps, store } = failing();

    expect(await upgrade_vault_work_factor(USER_ID, deps)).toBe("failed");
    expect(read_vault_work_factor_backoff(store, "user-2")).toBeNull();
    expect(await upgrade_vault_work_factor("user-2", deps)).toBe("failed");
    expect(read_vault_work_factor_backoff(store, "user-2")?.failures).toBe(1);
    expect(read_vault_work_factor_backoff(store, USER_ID)?.failures).toBe(1);
  });
});
