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

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.fn();
const put_public_key = vi.fn();
const put_key = vi.fn();
const open_token = vi.fn();
const refresh_backup = vi.fn();
const push_vault = vi.fn();
const codes_status = vi.fn();
let memory_vault: EncryptedVault | null = null;

vi.mock("../api/account_key", () => ({
  get_account_key_capabilities: () => Promise.resolve({ key_escrow: true }),
}));

vi.mock("../api/recovery", () => ({
  get_codes_status: () => codes_status(),
  get_recovery_escrow_state: () => state(),
  put_recovery_escrow_public_key: (key: string) => put_public_key(key),
  put_recovery_escrow_key: (version: number, sealed: string) =>
    put_key(version, sealed),
}));

vi.mock("./account_key_token", () => ({
  open_account_key_token: () => open_token(),
}));

vi.mock("./ensure_ratchet_keys", () => ({
  verify_vault_roundtrip: () => Promise.resolve(true),
  push_vault_to_server: (...args: unknown[]) => push_vault(...args),
}));

vi.mock("./key_manager", async (import_original) => ({
  ...((await import_original()) as object),
  encrypt_vault: () =>
    Promise.resolve({ encrypted_vault: "cipher", vault_nonce: "nonce" }),
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => memory_vault,
  is_vault_owned_by: () => true,
}));

vi.mock("./recovery_backup_refresh", () => ({
  recovery_codes_of: (vault: EncryptedVault) => vault.recovery_codes ?? [],
  refresh_recovery_backup: (vault: EncryptedVault) => refresh_backup(vault),
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock: <T>(fn: () => Promise<T>) => fn(),
}));

import { sync_recovery_escrow } from "./recovery_escrow";
import { array_to_base64 } from "./base64";
import {
  ESCROW_FORMAT,
  decode_escrow_seed,
  derive_escrow_keys,
  derive_legacy_escrow_keypair,
  encode_escrow_seed,
  generate_escrow_seed,
  open_account_key_from_escrow,
} from "./recovery_key_escrow";

const USER_ID = "5a1c3e7b-0d42-4f6a-8b19-7c2e9d4f0a63";
const TOKEN = { token: "armored", version: 3 } as never;

function make_vault(extra: Partial<EncryptedVault> = {}): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    recovery_codes: ["code-a", "code-b"],
    ...extra,
  } as EncryptedVault;
}

function pushed_vault(): EncryptedVault {
  return push_vault.mock.calls[push_vault.mock.calls.length - 1][4];
}

describe("sync_recovery_escrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory_vault = null;
    put_public_key.mockResolvedValue({ data: {} });
    put_key.mockResolvedValue({ data: {} });
    open_token.mockImplementation(() =>
      Promise.resolve(new Uint8Array(32).fill(4)),
    );
    refresh_backup.mockResolvedValue(true);
    codes_status.mockResolvedValue({
      data: { created_at: null, total: 0, remaining: 0, used: [] },
    });
    push_vault.mockImplementation((...args: unknown[]) =>
      Promise.resolve(args[4]),
    );
  });

  it("moves a legacy escrow to the current format", async () => {
    const seed = generate_escrow_seed();
    const legacy = derive_legacy_escrow_keypair(seed, USER_ID);
    const current = derive_escrow_keys(seed, USER_ID);
    const vault = make_vault({ escrow_seed: encode_escrow_seed(seed) });

    state.mockResolvedValue({
      data: {
        escrow_public_key: array_to_base64(legacy.public_key),
        token_versions: [3],
      },
    });

    expect(
      await sync_recovery_escrow(USER_ID, vault, "pass", TOKEN, []),
    ).toBe(true);

    expect(put_public_key).toHaveBeenCalledWith(
      array_to_base64(current.public_key),
    );
    expect(put_key).toHaveBeenCalledTimes(1);

    const [version, sealed] = put_key.mock.calls[0];
    const opened = await open_account_key_from_escrow(
      sealed,
      current,
      USER_ID,
      version,
    );

    expect(version).toBe(3);
    expect(opened && Array.from(opened)).toEqual(
      Array.from(new Uint8Array(32).fill(4)),
    );
    expect(refresh_backup).toHaveBeenCalledTimes(1);
    expect(refresh_backup.mock.calls[0][0].escrow_format).toBe(ESCROW_FORMAT);
    expect(pushed_vault().escrow_format).toBe(ESCROW_FORMAT);
    expect(pushed_vault().escrow_seed).toBe(vault.escrow_seed);
  });

  it("keeps the vault unmarked when the backup refresh fails", async () => {
    const seed = generate_escrow_seed();
    const current = derive_escrow_keys(seed, USER_ID);

    state.mockResolvedValue({
      data: {
        escrow_public_key: array_to_base64(current.public_key),
        token_versions: [3],
      },
    });
    refresh_backup.mockResolvedValue(false);

    expect(
      await sync_recovery_escrow(
        USER_ID,
        make_vault({ escrow_seed: encode_escrow_seed(seed) }),
        "pass",
        TOKEN,
        [],
      ),
    ).toBe(false);
    expect(push_vault).not.toHaveBeenCalled();
    expect(put_key).not.toHaveBeenCalled();
  });

  it("marks a vault without recovery codes or a backup without a refresh", async () => {
    const seed = generate_escrow_seed();
    const current = derive_escrow_keys(seed, USER_ID);

    state.mockResolvedValue({
      data: {
        escrow_public_key: array_to_base64(current.public_key),
        token_versions: [3],
      },
    });

    expect(
      await sync_recovery_escrow(
        USER_ID,
        make_vault({
          escrow_seed: encode_escrow_seed(seed),
          recovery_codes: [],
        }),
        "pass",
        TOKEN,
        [],
      ),
    ).toBe(true);
    expect(refresh_backup).not.toHaveBeenCalled();
    expect(pushed_vault().escrow_format).toBe(ESCROW_FORMAT);
  });

  it("keeps the vault unmarked while a backup exists that it cannot refresh", async () => {
    const seed = generate_escrow_seed();
    const current = derive_escrow_keys(seed, USER_ID);

    state.mockResolvedValue({
      data: {
        escrow_public_key: array_to_base64(current.public_key),
        token_versions: [3],
      },
    });
    codes_status.mockResolvedValue({
      data: {
        created_at: "2026-01-01T00:00:00Z",
        total: 10,
        remaining: 10,
        used: [],
      },
    });

    expect(
      await sync_recovery_escrow(
        USER_ID,
        make_vault({
          escrow_seed: encode_escrow_seed(seed),
          recovery_codes: [],
        }),
        "pass",
        TOKEN,
        [],
      ),
    ).toBe(false);
    expect(refresh_backup).not.toHaveBeenCalled();
    expect(push_vault).not.toHaveBeenCalled();
  });

  it("keeps the vault unmarked when the backup state is unknown", async () => {
    const seed = generate_escrow_seed();
    const current = derive_escrow_keys(seed, USER_ID);

    state.mockResolvedValue({
      data: {
        escrow_public_key: array_to_base64(current.public_key),
        token_versions: [3],
      },
    });
    codes_status.mockResolvedValue({ error: "unavailable" });

    expect(
      await sync_recovery_escrow(
        USER_ID,
        make_vault({
          escrow_seed: encode_escrow_seed(seed),
          recovery_codes: [],
        }),
        "pass",
        TOKEN,
        [],
      ),
    ).toBe(false);
    expect(push_vault).not.toHaveBeenCalled();
  });

  it("does nothing more for a current escrow that already holds the version", async () => {
    const seed = generate_escrow_seed();
    const current = derive_escrow_keys(seed, USER_ID);

    state.mockResolvedValue({
      data: {
        escrow_public_key: array_to_base64(current.public_key),
        token_versions: [3],
      },
    });

    expect(
      await sync_recovery_escrow(
        USER_ID,
        make_vault({
          escrow_seed: encode_escrow_seed(seed),
          escrow_format: ESCROW_FORMAT,
        }),
        "pass",
        TOKEN,
        [],
      ),
    ).toBe(true);
    expect(put_public_key).not.toHaveBeenCalled();
    expect(put_key).not.toHaveBeenCalled();
    expect(refresh_backup).not.toHaveBeenCalled();
    expect(push_vault).not.toHaveBeenCalled();
  });

  it("creates a seed in the current format", async () => {
    state.mockResolvedValue({
      data: { escrow_public_key: null, token_versions: [] },
    });

    expect(
      await sync_recovery_escrow(USER_ID, make_vault(), "pass", TOKEN, []),
    ).toBe(true);

    const stored = pushed_vault();
    const seed = decode_escrow_seed(stored.escrow_seed ?? "");

    expect(stored.escrow_format).toBe(ESCROW_FORMAT);
    expect(seed).not.toBeNull();
    expect(put_public_key).toHaveBeenCalledWith(
      array_to_base64(derive_escrow_keys(seed as Uint8Array, USER_ID).public_key),
    );
    expect(refresh_backup).not.toHaveBeenCalled();
    expect(push_vault).toHaveBeenCalledTimes(1);
  });

  it("stops when the server refuses the public key", async () => {
    state.mockResolvedValue({
      data: { escrow_public_key: null, token_versions: [] },
    });
    put_public_key.mockResolvedValue({ error: "rate limited" });

    expect(
      await sync_recovery_escrow(
        USER_ID,
        make_vault({ escrow_seed: encode_escrow_seed(generate_escrow_seed()) }),
        "pass",
        TOKEN,
        [],
      ),
    ).toBe(false);
    expect(put_key).not.toHaveBeenCalled();
    expect(push_vault).not.toHaveBeenCalled();
  });
});
