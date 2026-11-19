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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saved_backups: {
  encrypted_data: string;
  nonce: string;
  salt: string;
}[] = [];
const issued_keys: Uint8Array[] = [];
const readiness = { recovery_backup_v2_ready: false };

vi.mock("../api/recovery", () => ({
  get_codes_status: async () => ({ data: {} }),
  save_recovery_backup: async (
    encrypted_data: string,
    nonce: string,
    salt: string,
  ) => {
    saved_backups.push({ encrypted_data, nonce, salt });

    return { data: { success: true } };
  },
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: { ...readiness } })),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock("./vault_cas_write", async (import_original) => {
  const actual = await import_original<typeof import("./vault_cas_write")>();

  return {
    ...actual,
    write_vault_merged: vi.fn(async () => ({ status: "written" })),
  };
});

vi.mock("./backup_unlocked_keys", () => ({
  build_backup_vault: async (vault: unknown) => vault,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({ user: { id: "user-1" } }),
  get_all_accounts: async () => [],
}));

vi.mock("@/lib/ignore_error", () => ({ ignore_error: vi.fn() }));

vi.mock("./recovery_key", async (import_original) => {
  const actual = await import_original<typeof import("./recovery_key")>();

  return {
    ...actual,
    generate_recovery_key: () => {
      const key = crypto.getRandomValues(new Uint8Array(32));

      issued_keys.push(key.slice());

      return key;
    },
    generate_all_recovery_shares: async () => [],
    clear_recovery_key: () => undefined,
  };
});

import { reset_sync_format_readiness_cache } from "../api/sync_format_readiness";

import { read_vault_backup } from "./recovery_key";
import { refresh_recovery_backup } from "./recovery_backup_refresh";
import { merge_vault_for_write } from "./vault_cas_write";

type ResealFn =
  ((v: EncryptedVault, p: string) => Promise<boolean>) | undefined;

const CODES = ["ASTER-AAAA-BBBB-CCCC-DDDD"];

function vault(fields: Record<string, unknown> = {}): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: CODES,
    ...fields,
  } as unknown as EncryptedVault;
}

async function last_generation(): Promise<number> {
  const backup = saved_backups[saved_backups.length - 1];
  const key = issued_keys[issued_keys.length - 1];

  return (await read_vault_backup(backup, key)).generation;
}

describe("recovery backup format and generation", () => {
  beforeEach(() => {
    saved_backups.length = 0;
    issued_keys.length = 0;
    readiness.recovery_backup_v2_ready = false;
    globalThis.localStorage?.clear();
    reset_sync_format_readiness_cache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the old format while the account is not ready", async () => {
    await refresh_recovery_backup(vault(), "pass");

    expect(await last_generation()).toBe(0);
  });

  it("counts the generation up instead of using the clock", async () => {
    readiness.recovery_backup_v2_ready = true;
    vi.spyOn(Date, "now").mockReturnValue(8_000_000_000_000);

    await refresh_recovery_backup(vault(), "pass");

    expect(await last_generation()).toBe(1);
  });

  it("continues from the generation stored in the vault", async () => {
    await refresh_recovery_backup(
      vault({ recovery_backup_generation: 7 }),
      "pass",
    );

    expect(await last_generation()).toBe(8);
  });

  it("re-seals an old-format backup on unlock once the account is ready", async () => {
    const refresh = await import("./recovery_backup_refresh");
    const lookup = refresh as Record<string, unknown>;
    const reseal = lookup.reseal_unbound_recovery_backup as ResealFn;

    expect(reseal).toBeTypeOf("function");

    readiness.recovery_backup_v2_ready = true;

    expect(await reseal?.(vault(), "pass")).toBe(true);
    expect(await last_generation()).toBe(1);
  });

  it("leaves a bound backup alone on unlock", async () => {
    const refresh = await import("./recovery_backup_refresh");
    const lookup = refresh as Record<string, unknown>;
    const reseal = lookup.reseal_unbound_recovery_backup as ResealFn;

    expect(reseal).toBeTypeOf("function");

    readiness.recovery_backup_v2_ready = true;

    expect(
      await reseal?.(vault({ recovery_backup_generation: 3 }), "pass"),
    ).toBe(false);
    expect(saved_backups).toHaveLength(0);
  });

  it("never lowers the stored generation or the format marker in a merge", () => {
    const merged = merge_vault_for_write(
      vault({ recovery_backup_generation: 9, ratchet_state_v2: true }),
      vault({ recovery_backup_generation: 2 }),
      vault({ recovery_backup_generation: 3, ratchet_state_v2: false }),
    ) as unknown as Record<string, unknown>;

    expect(merged.recovery_backup_generation).toBe(9);
    expect(merged.ratchet_state_v2).toBe(true);
  });
});
