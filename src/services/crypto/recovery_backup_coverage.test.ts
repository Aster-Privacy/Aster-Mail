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
import type { VaultWrittenEvent } from "./vault_cas_write";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SaveCall {
  vault: EncryptedVault;
  options: { backup_key_fingerprints?: string[] } | undefined;
}

const h = vi.hoisted(() => ({
  saves: [] as SaveCall[],
  responses: [] as unknown[],
  status: {} as Record<string, unknown>,
  status_fails: false,
  status_reads: 0,
  bound: false,
  owner: "user-1" as string | null,
  latest: null as EncryptedVault | null,
  written: [] as ((event: VaultWrittenEvent) => void)[],
  cleared: [] as ((event: { same_owner: boolean }) => void)[],
}));

vi.mock("../api/sync_format_readiness", () => ({
  get_sync_format_readiness: async () => ({
    ratchet_sync_bound: h.bound,
    recovery_backup_bound: h.bound,
  }),
}));

vi.mock("./vault_cas_write", () => ({
  write_vault_merged: async () => ({ status: "written" }),
  read_latest_vault: async () => (h.latest ? { vault: h.latest } : null),
  vault_passphrase: () => "pass",
  on_vault_written: (listener: (event: VaultWrittenEvent) => void) => {
    h.written.push(listener);

    return () => undefined;
  },
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => h.latest,
  get_vault_owner_id: () => h.owner,
  on_vault_cleared: (listener: (event: { same_owner: boolean }) => void) => {
    h.cleared.push(listener);

    return () => undefined;
  },
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock: <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("./ratchet_key_continuity", () => ({
  carry_displaced_ratchet_keys: (
    target: EncryptedVault,
    displaced: EncryptedVault | null,
  ) => {
    if (!displaced) return target;

    const known = new Set(
      [
        target.ratchet_identity_public,
        ...(target.ratchet_previous_keys ?? []).map(
          (previous) => previous.ratchet_identity_public,
        ),
      ].filter(Boolean),
    );
    const carried = [
      ...(displaced.ratchet_previous_keys ?? []),
      ...(displaced.ratchet_identity_key && displaced.ratchet_identity_public
        ? [
            {
              ratchet_identity_key: displaced.ratchet_identity_key,
              ratchet_identity_public: displaced.ratchet_identity_public,
              ratchet_signed_prekey: displaced.ratchet_signed_prekey ?? "",
              ratchet_signed_prekey_public:
                displaced.ratchet_signed_prekey_public ?? "",
            },
          ]
        : []),
    ].filter((previous) => !known.has(previous.ratchet_identity_public));

    return {
      ...target,
      ratchet_previous_keys: [
        ...(target.ratchet_previous_keys ?? []),
        ...carried,
      ],
    };
  },
}));

vi.mock("../api/recovery", () => ({
  get_codes_status: async () => {
    h.status_reads += 1;

    if (h.status_fails) return { error: "unavailable" };

    return { data: h.status };
  },
  save_recovery_backup: async (
    encrypted_data: string,
    _nonce: string,
    _salt: string,
    _shares: unknown,
    options?: { backup_key_fingerprints?: string[] },
  ) => {
    h.saves.push({
      vault: JSON.parse(encrypted_data) as EncryptedVault,
      options,
    });

    return h.responses.shift() ?? { data: { success: true } };
  },
}));

vi.mock("./backup_unlocked_keys", () => ({
  build_backup_vault: async (vault: unknown) => vault,
}));

vi.mock("./recovery_key", () => ({
  generate_recovery_key: () => new Uint8Array(32),
  encrypt_vault_backup: async (vault: unknown) => ({
    encrypted_data: JSON.stringify(vault),
    nonce: "nonce",
    salt: "salt",
  }),
  generate_all_recovery_shares: async () => [],
  clear_recovery_key: () => undefined,
}));

vi.mock("./vault_key_fingerprints", () => ({
  collect_vault_key_fingerprints: async (vault: EncryptedVault) =>
    [
      vault.ratchet_identity_public,
      ...(vault.ratchet_previous_keys ?? []).map(
        (previous) => previous.ratchet_identity_public,
      ),
    ].filter((value): value is string => Boolean(value)),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({ user: { id: h.owner ?? "" } }),
  get_all_accounts: async () => [],
}));

vi.mock("@/lib/ignore_error", () => ({ ignore_error: vi.fn() }));

import {
  classify_recovery_backup_coverage,
  read_recovery_backup_coverage,
  write_recovery_backup_coverage,
} from "./recovery_backup_coverage";
import {
  BACKUP_DROPS_PUBLISHED_KEY,
  RECOVERY_BACKUP_REFRESH_DELAY_MS,
  backup_needs_catch_up,
  check_recovery_backup_coverage,
  is_backup_drops_published_key,
  refresh_recovery_backup,
  reset_recovery_backup_refresh_state,
  vault_key_material_changed,
  wait_for_recovery_backup_refresh,
} from "./recovery_backup_refresh";

const CODES = ["ASTER-AAAA-BBBB-CCCC-DDDD"];

function key_set(tag: string): RatchetKeySet {
  return {
    ratchet_identity_key: `ik-${tag}`,
    ratchet_identity_public: `ipub-${tag}`,
    ratchet_signed_prekey: `spk-${tag}`,
    ratchet_signed_prekey_public: `spkpub-${tag}`,
  };
}

function vault_with(
  current: string | null,
  previous: string[] = [],
  recovery_codes: string[] = CODES,
): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk-private",
    recovery_codes,
    ...(current ? key_set(current) : {}),
    ratchet_previous_keys: previous.map(key_set),
  };
}

function emit_written(
  previous: EncryptedVault | null,
  vault: EncryptedVault,
): void {
  h.latest = vault;

  for (const listener of h.written) {
    listener({ user_id: h.owner ?? "", previous, vault });
  }
}

async function settle_refresh(): Promise<void> {
  await vi.advanceTimersByTimeAsync(RECOVERY_BACKUP_REFRESH_DELAY_MS + 10);
  await wait_for_recovery_backup_refresh();
}

const written_listeners = [...h.written];
const cleared_listeners = [...h.cleared];

beforeEach(() => {
  h.saves.length = 0;
  h.responses.length = 0;
  h.status = {};
  h.status_fails = false;
  h.status_reads = 0;
  h.bound = false;
  h.owner = "user-1";
  h.latest = null;
  localStorage.clear();
  reset_recovery_backup_refresh_state();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("listeners", () => {
  it("subscribes to vault writes and vault clears once", () => {
    expect(written_listeners).toHaveLength(1);
    expect(cleared_listeners).toHaveLength(1);
  });
});

describe("classify_recovery_backup_coverage", () => {
  it("reports a vault whose keys the backup holds as covered", () => {
    expect(classify_recovery_backup_coverage(["a", "b"], ["b", "a"])).toBe(
      "covered",
    );
  });

  it("reports keys the backup lacks as uncovered", () => {
    expect(classify_recovery_backup_coverage(["a", "b"], ["a"])).toBe(
      "uncovered",
    );
    expect(classify_recovery_backup_coverage(["a"], null)).toBe("uncovered");
  });

  it("reports a vault that lacks a backed up key as a shrink", () => {
    expect(classify_recovery_backup_coverage(["b"], ["a"])).toBe(
      "would_shrink",
    );
    expect(classify_recovery_backup_coverage(["a"], ["a", "b"])).toBe(
      "would_shrink",
    );
  });

  it("does not judge a vault without inbound keys", () => {
    expect(classify_recovery_backup_coverage([], ["a"])).toBe("unknown");
  });
});

describe("vault_key_material_changed", () => {
  it("sees a created key, a rotated key and a changed history", () => {
    expect(vault_key_material_changed(vault_with(null), vault_with("a"))).toBe(
      true,
    );
    expect(
      vault_key_material_changed(vault_with("a"), vault_with("b", ["a"])),
    ).toBe(true);
    expect(
      vault_key_material_changed(
        vault_with("b", ["a"]),
        vault_with("b", ["a", "z"]),
      ),
    ).toBe(true);
    expect(vault_key_material_changed(null, vault_with("a"))).toBe(true);
  });

  it("ignores bookkeeping fields", () => {
    const before = vault_with("a");
    const after: EncryptedVault = {
      ...vault_with("a"),
      vault_generation: 9,
      recovery_backup_generation: 4,
    };

    expect(vault_key_material_changed(before, after)).toBe(false);
  });
});

describe("backup_needs_catch_up", () => {
  it("refreshes when the server reports missing or unknown coverage", () => {
    expect(backup_needs_catch_up(false, ["a"], ["a"])).toBe(true);
    expect(backup_needs_catch_up(null, ["a"], null)).toBe(true);
  });

  it("trusts a server that reports coverage unless the device knows more", () => {
    expect(backup_needs_catch_up(true, ["a"], null)).toBe(false);
    expect(backup_needs_catch_up(true, ["a"], ["a"])).toBe(false);
    expect(backup_needs_catch_up(true, ["a", "b"], ["a"])).toBe(true);
  });

  it("falls back to the device record when the server reports nothing", () => {
    expect(backup_needs_catch_up(undefined, ["a"], null)).toBe(true);
    expect(backup_needs_catch_up(undefined, ["a", "b"], ["a"])).toBe(true);
    expect(backup_needs_catch_up(undefined, ["a"], ["a"])).toBe(false);
  });

  it("never refreshes from a vault that holds fewer keys", () => {
    expect(backup_needs_catch_up(false, ["b"], ["a", "b"])).toBe(false);
    expect(backup_needs_catch_up(undefined, ["b"], ["a"])).toBe(false);
    expect(backup_needs_catch_up(false, [], ["a"])).toBe(false);
  });
});

describe("refresh after a vault write", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("writes a backup that holds a newly created key", async () => {
    emit_written(vault_with(null), vault_with("a"));
    await settle_refresh();

    expect(h.saves).toHaveLength(1);
    expect(h.saves[0].vault.ratchet_identity_key).toBe("ik-a");
    expect(h.saves[0].options).toEqual({ backup_key_fingerprints: ["ipub-a"] });
    expect(read_recovery_backup_coverage("user-1")).toContain("ipub-a");
  });

  it("writes a backup that holds the rotated key and the history", async () => {
    emit_written(vault_with("a"), vault_with("b", ["a"]));
    await settle_refresh();

    expect(h.saves).toHaveLength(1);
    expect(h.saves[0].vault.ratchet_identity_key).toBe("ik-b");
    expect(
      h.saves[0].vault.ratchet_previous_keys?.map(
        (previous) => previous.ratchet_identity_key,
      ),
    ).toEqual(["ik-a"]);
    expect(h.saves[0].options).toEqual({
      backup_key_fingerprints: ["ipub-b", "ipub-a"],
    });
  });

  it("does nothing when a write leaves the keys unchanged", async () => {
    emit_written(vault_with("a"), { ...vault_with("a"), vault_generation: 3 });
    await settle_refresh();

    expect(h.saves).toHaveLength(0);
  });

  it("does nothing without recovery codes", async () => {
    emit_written(vault_with(null, [], []), vault_with("a", [], []));
    await settle_refresh();

    expect(h.saves).toHaveLength(0);
  });

  it("collapses a burst of writes into one backup of the latest vault", async () => {
    emit_written(vault_with(null), vault_with("a"));
    emit_written(vault_with("a"), vault_with("b", ["a"]));
    emit_written(vault_with("b", ["a"]), vault_with("c", ["a", "b"]));
    await settle_refresh();

    expect(h.saves).toHaveLength(1);
    expect(h.saves[0].vault.ratchet_identity_key).toBe("ik-c");
  });

  it("does not write the same keys twice", async () => {
    emit_written(vault_with(null), vault_with("a"));
    await settle_refresh();
    emit_written(null, vault_with("a"));
    await settle_refresh();

    expect(h.saves).toHaveLength(1);
  });

  it("stops when the account changes before the timer fires", async () => {
    emit_written(vault_with(null), vault_with("a"));

    for (const listener of h.cleared) listener({ same_owner: false });

    await settle_refresh();

    expect(h.saves).toHaveLength(0);
  });

  it("keeps a failed save from recording coverage", async () => {
    h.responses.push({ error: "unavailable" });
    emit_written(vault_with(null), vault_with("a"));
    await settle_refresh();

    expect(h.saves).toHaveLength(1);
    expect(read_recovery_backup_coverage("user-1")).toBeNull();
  });
});

describe("check_recovery_backup_coverage", () => {
  it("refreshes once when the server reports nothing and the device has no record", async () => {
    h.latest = vault_with("b", ["a"]);

    await expect(check_recovery_backup_coverage()).resolves.toBe(true);
    await expect(check_recovery_backup_coverage()).resolves.toBe(false);

    expect(h.saves).toHaveLength(1);
    expect(h.status_reads).toBe(2);
    expect(read_recovery_backup_coverage("user-1")).toEqual(
      expect.arrayContaining(["ipub-b", "ipub-a"]),
    );
  });

  it("does not refresh again in a later session once the record matches", async () => {
    h.latest = vault_with("a");

    await check_recovery_backup_coverage();
    reset_recovery_backup_refresh_state();
    await expect(check_recovery_backup_coverage()).resolves.toBe(false);

    expect(h.saves).toHaveLength(1);
  });

  it("refreshes when the server reports that the backup lacks a key", async () => {
    h.latest = vault_with("a");
    h.status = { backup_covers_published_keys: false };
    write_recovery_backup_coverage("user-1", ["ipub-a"]);

    await expect(check_recovery_backup_coverage()).resolves.toBe(true);
    expect(h.saves).toHaveLength(1);
  });

  it("leaves a backup alone when the server reports coverage", async () => {
    h.latest = vault_with("a");
    h.status = { backup_covers_published_keys: true };

    await expect(check_recovery_backup_coverage()).resolves.toBe(false);
    expect(h.saves).toHaveLength(0);
  });

  it("never replaces a backup with a vault that holds fewer keys", async () => {
    h.latest = vault_with("b");
    h.status = { backup_covers_published_keys: false };
    write_recovery_backup_coverage("user-1", ["ipub-b", "ipub-a"]);

    await expect(check_recovery_backup_coverage()).resolves.toBe(false);
    expect(h.saves).toHaveLength(0);
    expect(read_recovery_backup_coverage("user-1")).toEqual([
      "ipub-b",
      "ipub-a",
    ]);
  });

  it("does nothing without recovery codes", async () => {
    h.latest = vault_with("a", [], []);

    await expect(check_recovery_backup_coverage()).resolves.toBe(false);
    expect(h.saves).toHaveLength(0);
    expect(h.status_reads).toBe(0);
  });

  it("tries again later when the status read fails", async () => {
    h.latest = vault_with("a");
    h.status_fails = true;

    await expect(check_recovery_backup_coverage()).resolves.toBe(false);
    expect(h.saves).toHaveLength(0);

    h.status_fails = false;

    await expect(check_recovery_backup_coverage()).resolves.toBe(true);
    expect(h.saves).toHaveLength(1);
  });

  it("does not retry in the same session after a failed save", async () => {
    h.latest = vault_with("a");
    h.responses.push({ error: "unavailable" });

    await expect(check_recovery_backup_coverage()).resolves.toBe(false);
    await expect(check_recovery_backup_coverage()).resolves.toBe(false);

    expect(h.saves).toHaveLength(1);
  });

  it("binds an unbound backup when no catch-up is needed", async () => {
    h.latest = vault_with("a");
    h.status = { backup_covers_published_keys: true };
    h.bound = true;

    await expect(check_recovery_backup_coverage()).resolves.toBe(true);
    expect(h.saves).toHaveLength(1);
  });

  it("does nothing without a signed-in owner", async () => {
    h.latest = vault_with("a");
    h.owner = null;

    await expect(check_recovery_backup_coverage()).resolves.toBe(false);
    expect(h.saves).toHaveLength(0);
  });
});

describe("a save the server refuses", () => {
  const refusal = {
    status: 409,
    error: "conflict",
    server_code: BACKUP_DROPS_PUBLISHED_KEY,
  };

  it("recognizes the refusal only on a conflict", () => {
    expect(is_backup_drops_published_key(refusal)).toBe(true);
    expect(
      is_backup_drops_published_key({
        status: 409,
        body: { code: BACKUP_DROPS_PUBLISHED_KEY },
      }),
    ).toBe(true);
    expect(is_backup_drops_published_key({ status: 409 })).toBe(false);
    expect(is_backup_drops_published_key({ ...refusal, status: 500 })).toBe(
      false,
    );
  });

  it("retries once with the keys of the latest vault merged in", async () => {
    h.latest = vault_with("b", ["a"]);
    h.responses.push(refusal);

    await expect(
      refresh_recovery_backup(vault_with("a"), "pass"),
    ).resolves.toBe(true);

    expect(h.saves).toHaveLength(2);
    expect(h.saves[1].vault.ratchet_identity_key).toBe("ik-b");
    expect(h.saves[1].options).toEqual({
      backup_key_fingerprints: ["ipub-b", "ipub-a"],
    });
  });

  it("gives up after one retry", async () => {
    h.latest = vault_with("b", ["a"]);
    h.responses.push(refusal, refusal);

    await expect(
      refresh_recovery_backup(vault_with("a"), "pass"),
    ).resolves.toBe(false);

    expect(h.saves).toHaveLength(2);
    expect(read_recovery_backup_coverage("user-1")).toBeNull();
  });
});

describe("an explicit refresh", () => {
  it("omits the coverage field for a vault without inbound keys", async () => {
    await expect(
      refresh_recovery_backup(vault_with(null), "pass"),
    ).resolves.toBe(true);

    expect(h.saves[0].options).toEqual({});
  });

  it("runs saves one after another", async () => {
    const first = refresh_recovery_backup(vault_with("a"), "pass");
    const second = refresh_recovery_backup(vault_with("b", ["a"]), "pass");

    await Promise.all([first, second]);

    expect(h.saves.map((save) => save.vault.ratchet_identity_key)).toEqual([
      "ik-a",
      "ik-b",
    ]);
  });
});
