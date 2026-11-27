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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({ owner: null as string | null }));

const spies = vi.hoisted(() => ({
  decrypt: vi.fn(),
  store: vi.fn(async (_vault: unknown, _passphrase: string, owner?: string) => {
    memory.owner = owner ?? null;
  }),
  adopt: vi.fn(async () => false),
  maintenance: vi.fn(async () => "idle"),
  recovery: vi.fn(async () => undefined),
  publish_pgp: vi.fn(async () => undefined),
  ratchet: vi.fn(async () => false),
  rewrap: vi.fn(async () => undefined),
  admission: vi.fn(async () => "refused"),
  password_strength: vi.fn(async () => ({})),
}));

vi.mock("@/services/crypto/key_manager", async (import_original) => ({
  ...(await import_original<typeof import("@/services/crypto/key_manager")>()),
  decrypt_vault: spies.decrypt,
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  store_vault_in_memory: spies.store,
  has_vault_in_memory: () => memory.owner !== null,
  has_vault_in_memory_for: (user_id: string) => memory.owner === user_id,
}));

vi.mock("@/services/crypto/mk_adoption", () => ({
  adopt_master_key_if_needed: spies.adopt,
}));

vi.mock("@/services/crypto/storage_rotation/background", () => ({
  prepare_storage_key_gate: vi.fn(),
  run_storage_key_maintenance: spies.maintenance,
}));

vi.mock("@/services/crypto/auto_rekey", () => ({
  auto_rekey_if_needed: vi.fn(async () => false),
  reset_rekey_flag: vi.fn(),
}));

vi.mock("@/services/crypto/recovery_reencrypt", () => ({
  check_and_run_recovery_reencryption: spies.recovery,
}));

vi.mock("@/services/crypto/ensure_pgp_key_published", () => ({
  ensure_pgp_key_published: spies.publish_pgp,
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: spies.ratchet,
}));

vi.mock("@/services/crypto/encrypted_storage", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/encrypted_storage")
  >()),
  rewrap_legacy_entries: spies.rewrap,
}));

vi.mock("@/services/crypto/vault_level2", async (import_original) => ({
  ...(await import_original<typeof import("@/services/crypto/vault_level2")>()),
  request_level2_admission: spies.admission,
}));

vi.mock("@/services/api/account", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/account")>()),
  backfill_password_strength_tier: spies.password_strength,
}));

import {
  decrypt_vault_with_lock,
  record_password_strength_from_input,
} from "./vault_decryption";
import {
  begin_session_confirmation,
  end_session_confirmation,
} from "./session_confirmation";

const PRIMARY = "user-primary";
const SECONDARY = "user-secondary";

const key_jobs = () => [
  spies.adopt,
  spies.maintenance,
  spies.recovery,
  spies.publish_pgp,
  spies.ratchet,
  spies.rewrap,
  spies.admission,
];

function deferred_verdict() {
  let settle: (value: boolean) => void = () => undefined;
  const verdict = new Promise<boolean>((resolve) => {
    settle = resolve;
  });

  return { verdict, settle };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(resolve(here, name), "utf8").replace(/\r\n/g, "\n");
}

beforeEach(() => {
  memory.owner = null;
  Object.values(spies).forEach((spy) => spy.mockClear());
  spies.decrypt.mockResolvedValue({
    identity_key: "identity",
    previous_keys: [],
  } as unknown as EncryptedVault);
});

afterEach(() => {
  end_session_confirmation();
  localStorage.clear();
});

describe("key requests after a secondary account refresh", () => {
  it("holds every key, vault and storage request until the session is confirmed", async () => {
    const { verdict, settle } = deferred_verdict();

    begin_session_confirmation(SECONDARY, verdict);
    await decrypt_vault_with_lock("sealed", "nonce", "passphrase", SECONDARY);
    await flush();

    for (const spy of key_jobs()) expect(spy).not.toHaveBeenCalled();

    settle(true);
    await flush();

    expect(spies.adopt).toHaveBeenCalledTimes(1);
    expect(spies.maintenance).toHaveBeenCalledTimes(1);
    expect(spies.publish_pgp).toHaveBeenCalledTimes(1);
    expect(spies.ratchet).toHaveBeenCalledTimes(1);
    expect(spies.admission).toHaveBeenCalledTimes(1);
  });

  it("sends none of them when the session is rejected", async () => {
    const { verdict, settle } = deferred_verdict();

    begin_session_confirmation(SECONDARY, verdict);
    await decrypt_vault_with_lock("sealed", "nonce", "passphrase", SECONDARY);
    settle(false);
    await flush();

    for (const spy of key_jobs()) expect(spy).not.toHaveBeenCalled();
  });

  it("drops the jobs when the active account changed before confirmation", async () => {
    const { verdict, settle } = deferred_verdict();

    begin_session_confirmation(SECONDARY, verdict);
    await decrypt_vault_with_lock("sealed", "nonce", "passphrase", SECONDARY);
    memory.owner = PRIMARY;
    settle(true);
    await flush();

    for (const spy of key_jobs()) expect(spy).not.toHaveBeenCalled();
  });

  it("never runs jobs for one account under the session check of another", async () => {
    const { verdict, settle } = deferred_verdict();

    begin_session_confirmation(PRIMARY, verdict);
    await decrypt_vault_with_lock("sealed", "nonce", "passphrase", SECONDARY);
    settle(true);
    await flush();

    for (const spy of key_jobs()) expect(spy).not.toHaveBeenCalled();
  });

  it("never posts the password strength when a stored passphrase opens the vault", async () => {
    const { verdict, settle } = deferred_verdict();

    begin_session_confirmation(SECONDARY, verdict);
    await decrypt_vault_with_lock("sealed", "nonce", "passphrase", SECONDARY);
    settle(true);
    await flush();

    expect(spies.ratchet).toHaveBeenCalledTimes(1);
    expect(spies.password_strength).not.toHaveBeenCalled();
  });

  it("posts the password strength for a typed password", async () => {
    record_password_strength_from_input("typed password");
    await flush();

    expect(spies.password_strength).toHaveBeenCalledTimes(1);
  });

  it("runs at once when no session check is pending", async () => {
    await decrypt_vault_with_lock("sealed", "nonce", "passphrase", PRIMARY);
    await flush();

    expect(spies.ratchet).toHaveBeenCalledTimes(1);
    expect(spies.admission).toHaveBeenCalledTimes(1);
  });
});

describe("startup order in the account restore", () => {
  it("starts the session check before the stored vault opens", () => {
    const source = read("use_auth_account_state.ts");
    const verify_at = source.indexOf("verify_auth_status().catch");
    const begin_at = source.indexOf(
      "begin_session_confirmation(current.user.id, verdict)",
    );
    const restore_at = source.indexOf(
      "const session_keys_restore = restore_session_keys()",
    );

    expect(verify_at).toBeGreaterThan(-1);
    expect(begin_at).toBeGreaterThan(verify_at);
    expect(restore_at).toBeGreaterThan(begin_at);
  });

  it("only records the password strength from typed passwords", () => {
    const vault_source = read("vault_decryption.ts");
    const unlock = vault_source.slice(
      vault_source.indexOf("export async function decrypt_vault_with_lock"),
    );

    expect(unlock).not.toContain("backfill_password_strength_tier");
    expect(
      read("use_auth_account_state.ts").match(
        /record_password_strength_from_input\(passphrase\)/g,
      )?.length,
    ).toBe(2);
  });
});
