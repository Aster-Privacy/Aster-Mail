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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { MAX_SERVER_FAILURES, b64, from_b64, state } = vi.hoisted(() => ({
  MAX_SERVER_FAILURES: 5,
  b64: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  from_b64: (value: string) =>
    Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
  state: {
  online: true,
  rate_limited: false,
  memory_passphrase: null as string | null,
  unwrapped: new Map<string, { passphrase: string; on_device: boolean }>(),
  locks: new Map<
    string,
    { verifier: string; secret: string; failures: number }
  >(),
  unwrap_calls: 0,
  delete_calls: [] as string[],
  tag_key: null as CryptoKey | null,
    pepper_db: new Map<string, unknown>(),
    native_file: new Map<string, "readable" | "sealed">(),
    native_seal_records: [] as string[],
    native_restores: [] as string[],
    active_account: null as string | null,
    delete_fails: false,
  },
}));

vi.mock("@/services/offline_email_cache", () => ({
  clear_account_list_cache: async () => undefined,
}));

vi.mock("@/services/crypto/encrypted_drafts", () => ({
  draft_manager: { await_all_pending_saves: async () => undefined },
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => state.active_account,
}));

vi.mock("@/native/desktop_device_auth", () => ({
  seal_device_passphrase: async (id: string, record: string) => {
    if (!state.native_file.has(id)) return false;
    state.native_seal_records.push(record);
    state.native_file.set(id, "sealed");

    return true;
  },
  restore_device_passphrase: async (id: string, passphrase: string) => {
    if (state.native_file.get(id) !== "sealed") return false;
    state.native_restores.push(passphrase);
    state.native_file.set(id, "readable");

    return true;
  },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_or_create_derived_encryption_crypto_key: async () => {
    if (!state.tag_key) {
      state.tag_key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    }

    return state.tag_key;
  },
  get_passphrase_from_memory: () => state.memory_passphrase,
  clear_vault_from_memory: () => {
    state.memory_passphrase = null;
  },
}));

vi.mock("@/services/crypto/key_manager", () => ({
  decrypt_vault: async (_vault: string, _nonce: string, password: string) => {
    if (password !== "account-password") throw new Error("bad password");

    return {};
  },
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  get_session_passphrase: async (id: string) =>
    state.unwrapped.get(id)?.passphrase ?? null,
  get_stored_encrypted_vault: () => ({
    encrypted_vault: "vault",
    vault_nonce: "nonce",
  }),
  is_session_passphrase_on_device: (id: string) =>
    state.unwrapped.get(id)?.on_device ?? true,
  remove_unwrapped_passphrase: (id: string) => {
    state.unwrapped.delete(id);
  },
  store_unwrapped_passphrase: async (
    id: string,
    passphrase: string,
    on_device = true,
  ) => {
    state.unwrapped.set(id, { passphrase, on_device });
  },
}));

vi.mock("@/services/app_lock_server", () => ({
  register_app_lock: async (device_lock_id: string, verifier: string) => {
    if (!state.online) return { status: "unavailable" };
    const secret = b64(crypto.getRandomValues(new Uint8Array(32)));

    state.locks.set(device_lock_id, { verifier, secret, failures: 0 });

    return { status: "ok", secret };
  },
  unwrap_app_lock: async (device_lock_id: string, proof: string) => {
    state.unwrap_calls += 1;
    if (!state.online) return { status: "unavailable" };
    if (state.rate_limited) return { status: "busy" };
    const lock = state.locks.get(device_lock_id);

    if (!lock) return { status: "reset" };
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", from_b64(proof)),
    );

    if (b64(digest) !== lock.verifier) {
      lock.failures += 1;
      if (lock.failures >= MAX_SERVER_FAILURES) {
        state.locks.delete(device_lock_id);

        return { status: "reset" };
      }

      return { status: "wrong_pin" };
    }
    lock.failures = 0;

    return { status: "ok", secret: lock.secret };
  },
  delete_app_lock: async (device_lock_id: string) => {
    if (state.delete_fails) return false;
    state.delete_calls.push(device_lock_id);
    state.locks.delete(device_lock_id);

    return true;
  },
}));

function install_pepper_db() {
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction: () => {
      const tx: {
        oncomplete: (() => void) | null;
        onerror: (() => void) | null;
        objectStore: () => unknown;
      } = {
        oncomplete: null,
        onerror: null,
        objectStore: () => ({
          get: (key: string) => {
            const req: {
              result: unknown;
              onsuccess: (() => void) | null;
              onerror: (() => void) | null;
            } = { result: state.pepper_db.get(key), onsuccess: null, onerror: null };

            setTimeout(() => req.onsuccess?.(), 0);

            return req;
          },
          put: (value: unknown, key: string) => {
            state.pepper_db.set(key, value);
            setTimeout(() => tx.oncomplete?.(), 0);
          },
        }),
      };

      return tx;
    },
  };

  Object.assign(globalThis, {
    indexedDB: {
      open: () => {
        const req: {
          result: unknown;
          onsuccess: (() => void) | null;
          onerror: (() => void) | null;
          onupgradeneeded: (() => void) | null;
        } = { result: db, onsuccess: null, onerror: null, onupgradeneeded: null };

        setTimeout(() => req.onsuccess?.(), 0);

        return req;
      },
    },
  });
}

import {
  clear_all_app_lock_data,
  generate_pin_salt,
  get_app_lock_config,
  hash_pin,
  is_session_unlocked,
  KDF_VERSION_SERVER_WRAP,
  save_app_lock_config,
  save_duress_pin,
} from "@/services/app_lock_store";
import {
  forget_all_unlocked_locks,
  get_pending_passphrase,
  get_unlocked_key,
  has_wrapped_passphrase,
  wait_for_app_unlock,
} from "@/services/app_lock_wrap";
import {
  attempt_app_unlock,
  convert_to_unwrapped,
  flush_pending_app_lock_deletes,
  pending_app_lock_deletes,
  release_app_lock,
  remove_app_lock,
  unlock_with_password,
  upgrade_to_server_wrap,
  wipe_unlocked_secrets,
} from "@/services/app_lock_unlock";

const ACCOUNT = "acct-wrap";
const REGULAR = "1234";
const DURESS = "9999";
const WRONG = "0000";
const PASSPHRASE = "account-password";

const to_hex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function set_up_legacy_lock(with_duress = false) {
  const salt = generate_pin_salt();

  save_app_lock_config(ACCOUNT, {
    enabled: true,
    pin_type: "numeric",
    digits: 4,
    pin_hash: await hash_pin(REGULAR, salt),
    pin_salt: to_hex(salt),
  });
  if (with_duress) {
    const duress_salt = generate_pin_salt();

    await save_duress_pin(
      ACCOUNT,
      await hash_pin(DURESS, duress_salt),
      to_hex(duress_salt),
    );
  }
  state.unwrapped.set(ACCOUNT, { passphrase: PASSPHRASE, on_device: true });
}

async function set_up_wrapped_lock(with_duress = false) {
  await set_up_legacy_lock(with_duress);
  expect(await upgrade_to_server_wrap(ACCOUNT, REGULAR)).toBe(true);
}

function simulate_reload() {
  forget_all_unlocked_locks();
  state.memory_passphrase = null;
  sessionStorage.clear();
}

function storage_values(): string[] {
  const out: string[] = [];

  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);

      if (key) out.push(`${key}=${store.getItem(key)}`);
    }
  }

  return out;
}

describe("server-held app lock", { timeout: 30000 }, () => {
  beforeEach(() => {
    install_pepper_db();
    state.online = true;
    state.rate_limited = false;
    state.memory_passphrase = null;
    state.unwrapped.clear();
    state.locks.clear();
    state.unwrap_calls = 0;
    state.delete_calls = [];
    state.pepper_db.clear();
    state.native_file.clear();
    state.native_seal_records = [];
    state.native_restores = [];
    state.active_account = ACCOUNT;
    state.delete_fails = false;
    forget_all_unlocked_locks();
    clear_all_app_lock_data();
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    forget_all_unlocked_locks();
    clear_all_app_lock_data();
  });

  it("migrates a legacy PIN lock on the next unlock", async () => {
    await set_up_legacy_lock();

    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
    await vi.waitFor(() => {
      expect(get_app_lock_config(ACCOUNT)?.kdf_version).toBe(
        KDF_VERSION_SERVER_WRAP,
      );
    });

    const config = get_app_lock_config(ACCOUNT);

    expect(config?.pin_hash).toBe("");
    expect(config?.pin_salt).toBe("");
    expect(config?.wrap?.device_lock_id).toBeTruthy();
    expect(state.locks.has(config!.wrap!.device_lock_id)).toBe(true);
    expect(has_wrapped_passphrase(ACCOUNT)).toBe(true);
    expect(state.unwrapped.has(ACCOUNT)).toBe(false);
  });

  it("never stores the passphrase in readable form once wrapped", async () => {
    await set_up_wrapped_lock();

    expect(state.unwrapped.has(ACCOUNT)).toBe(false);
    for (const entry of storage_values()) {
      expect(entry.includes(PASSPHRASE)).toBe(false);
    }
  });

  it("unlocks with the right PIN through the server", async () => {
    await set_up_wrapped_lock();
    simulate_reload();
    const waiter = wait_for_app_unlock(ACCOUNT);

    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
    expect(await waiter).toBe(true);
    expect(is_session_unlocked(ACCOUNT)).toBe(true);
    expect(get_unlocked_key(ACCOUNT)).not.toBeNull();
  });

  it("clears the unlock key and vault from memory on lock", async () => {
    await set_up_wrapped_lock();
    state.memory_passphrase = PASSPHRASE;
    await attempt_app_unlock(ACCOUNT, REGULAR);
    expect(get_unlocked_key(ACCOUNT)).not.toBeNull();

    expect(wipe_unlocked_secrets(ACCOUNT)).toBe(true);
    expect(get_unlocked_key(ACCOUNT)).toBeNull();
    expect(state.memory_passphrase).toBeNull();
    expect(is_session_unlocked(ACCOUNT)).toBe(false);
  });

  it("does not release the passphrase when the server can't be reached", async () => {
    await set_up_wrapped_lock();
    simulate_reload();
    state.online = false;

    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unavailable",
    });
    expect(get_unlocked_key(ACCOUNT)).toBeNull();
    expect(is_session_unlocked(ACCOUNT)).toBe(false);
    expect(state.unwrapped.has(ACCOUNT)).toBe(false);
    expect(has_wrapped_passphrase(ACCOUNT)).toBe(true);
  });

  it("asks the server for every PIN entry instead of checking locally", async () => {
    await set_up_wrapped_lock();
    simulate_reload();
    state.unwrap_calls = 0;

    await attempt_app_unlock(ACCOUNT, WRONG);
    await attempt_app_unlock(ACCOUNT, REGULAR);

    expect(state.unwrap_calls).toBe(2);
  });

  it("keeps counting failures on the server after local attempt state is cleared", async () => {
    await set_up_wrapped_lock();
    simulate_reload();

    for (let i = 0; i < MAX_SERVER_FAILURES - 1; i++) {
      const result = await attempt_app_unlock(ACCOUNT, WRONG);

      expect(result.outcome).toBe("failed");
      localStorage.removeItem(`aster:app_lock_attempts:${ACCOUNT}`);
      sessionStorage.removeItem(`aster:app_lock_attempts:${ACCOUNT}`);
    }

    expect(await attempt_app_unlock(ACCOUNT, WRONG)).toEqual({
      outcome: "reset",
    });
  });

  it("ignores a lockout or attempt count written to local storage", async () => {
    await set_up_wrapped_lock();
    simulate_reload();
    localStorage.setItem(
      `aster:app_lock_attempts:${ACCOUNT}`,
      JSON.stringify({ count: 0, locked_until: Date.now() + 3_600_000 }),
    );

    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
  });

  it("sends the user to a password sign-in once the server gives up", async () => {
    await set_up_wrapped_lock();
    simulate_reload();
    const waiter = wait_for_app_unlock(ACCOUNT);

    for (let i = 0; i < MAX_SERVER_FAILURES; i++) {
      await attempt_app_unlock(ACCOUNT, WRONG);
    }

    expect(await waiter).toBe(false);
    expect(get_app_lock_config(ACCOUNT)).toBeNull();
    expect(has_wrapped_passphrase(ACCOUNT)).toBe(false);
    expect(state.unwrapped.has(ACCOUNT)).toBe(false);
    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).not.toEqual({
      outcome: "unlocked",
    });
  });

  it("treats a lock the server no longer knows as reset", async () => {
    await set_up_wrapped_lock();
    simulate_reload();
    state.locks.clear();

    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "reset",
    });
    expect(get_app_lock_config(ACCOUNT)).toBeNull();
    expect(state.unwrapped.has(ACCOUNT)).toBe(false);
  });

  it("reports a rate limit as busy without unlocking", async () => {
    await set_up_wrapped_lock();
    simulate_reload();
    state.rate_limited = true;

    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "busy",
    });
    expect(get_unlocked_key(ACCOUNT)).toBeNull();
  });

  it("unlocks offline with the account password and re-wraps later", async () => {
    await set_up_wrapped_lock();
    simulate_reload();
    state.online = false;
    const waiter = wait_for_app_unlock(ACCOUNT);

    expect(await unlock_with_password(ACCOUNT, "not-it")).toBe(false);
    expect(is_session_unlocked(ACCOUNT)).toBe(false);

    expect(await unlock_with_password(ACCOUNT, PASSPHRASE)).toBe(true);
    expect(await waiter).toBe(true);
    expect(is_session_unlocked(ACCOUNT)).toBe(true);
    expect(get_pending_passphrase(ACCOUNT)?.passphrase).toBe(PASSPHRASE);

    state.online = true;
    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
    expect(get_pending_passphrase(ACCOUNT)).toBeNull();
    expect(has_wrapped_passphrase(ACCOUNT)).toBe(true);
  });

  it("still honors the duress PIN after migration", async () => {
    await set_up_wrapped_lock(true);
    simulate_reload();
    state.unwrap_calls = 0;

    expect(get_app_lock_config(ACCOUNT)?.duress_legacy_kdf).toBe(true);
    expect(await attempt_app_unlock(ACCOUNT, DURESS)).toEqual({
      outcome: "duress",
    });
    expect(state.unwrap_calls).toBe(0);
    expect(get_unlocked_key(ACCOUNT)).toBeNull();
  });

  it("honors the duress PIN while offline", async () => {
    await set_up_wrapped_lock(true);
    simulate_reload();
    state.online = false;

    expect(await attempt_app_unlock(ACCOUNT, DURESS)).toEqual({
      outcome: "duress",
    });
  });

  it("deletes the server record when the lock is released", async () => {
    await set_up_wrapped_lock();
    const id = get_app_lock_config(ACCOUNT)!.wrap!.device_lock_id;

    await release_app_lock(ACCOUNT);

    expect(state.delete_calls).toContain(id);
    expect(has_wrapped_passphrase(ACCOUNT)).toBe(false);
  });

  it("queues the server delete for an account that is not active", async () => {
    await set_up_wrapped_lock();
    const id = get_app_lock_config(ACCOUNT)!.wrap!.device_lock_id;

    state.active_account = "someone-else";
    await release_app_lock(ACCOUNT);

    expect(state.delete_calls).not.toContain(id);
    expect(pending_app_lock_deletes().map((e) => e.device_lock_id)).toEqual([
      id,
    ]);

    expect(await flush_pending_app_lock_deletes()).toBe(0);
    expect(pending_app_lock_deletes()).toHaveLength(1);

    state.active_account = ACCOUNT;
    expect(await flush_pending_app_lock_deletes()).toBe(1);
    expect(state.delete_calls).toContain(id);
    expect(pending_app_lock_deletes()).toHaveLength(0);
  });

  it("uses the account's own session when one is supplied", async () => {
    await set_up_wrapped_lock();
    const id = get_app_lock_config(ACCOUNT)!.wrap!.device_lock_id;
    const remote: string[] = [];

    state.active_account = "someone-else";
    await release_app_lock(ACCOUNT, async (lock_id) => {
      remote.push(lock_id);

      return true;
    });

    expect(remote).toEqual([id]);
    expect(state.delete_calls).not.toContain(id);
    expect(pending_app_lock_deletes()).toHaveLength(0);
  });

  it("keeps a failed delete queued and retries it later", async () => {
    await set_up_wrapped_lock();
    const id = get_app_lock_config(ACCOUNT)!.wrap!.device_lock_id;

    state.delete_fails = true;
    await release_app_lock(ACCOUNT);
    expect(pending_app_lock_deletes()).toHaveLength(1);

    expect(await flush_pending_app_lock_deletes()).toBe(0);
    expect(pending_app_lock_deletes()).toHaveLength(1);

    state.delete_fails = false;
    expect(await flush_pending_app_lock_deletes()).toBe(1);
    expect(state.delete_calls).toContain(id);
  });

  it("bounds the queue of pending deletes", async () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({
      account_id: ACCOUNT,
      device_lock_id: `lock-${i}`,
      queued_at: Date.now(),
    }));

    localStorage.setItem(
      "astermail_app_lock_pending_deletes",
      JSON.stringify([...entries, { bad: true }]),
    );
    await set_up_wrapped_lock();
    const id = get_app_lock_config(ACCOUNT)!.wrap!.device_lock_id;

    state.active_account = "someone-else";
    await release_app_lock(ACCOUNT);

    const queued = pending_app_lock_deletes();

    expect(queued).toHaveLength(20);
    expect(queued[queued.length - 1].device_lock_id).toBe(id);
  });

  it("drops expired or malformed queue entries", () => {
    localStorage.setItem(
      "astermail_app_lock_pending_deletes",
      JSON.stringify([
        { account_id: ACCOUNT, device_lock_id: "old", queued_at: 0 },
        { account_id: ACCOUNT, device_lock_id: 5, queued_at: Date.now() },
      ]),
    );
    expect(pending_app_lock_deletes()).toHaveLength(0);
    localStorage.setItem("astermail_app_lock_pending_deletes", "{not json");
    expect(pending_app_lock_deletes()).toHaveLength(0);
  });

  it("restores the readable passphrase only after turning the lock off", async () => {
    await set_up_wrapped_lock();
    await attempt_app_unlock(ACCOUNT, REGULAR);
    state.memory_passphrase = PASSPHRASE;
    const id = get_app_lock_config(ACCOUNT)!.wrap!.device_lock_id;

    expect(await convert_to_unwrapped(ACCOUNT)).toBe(true);
    expect(get_app_lock_config(ACCOUNT)?.enabled).toBe(false);
    expect(state.unwrapped.get(ACCOUNT)?.passphrase).toBe(PASSPHRASE);
    expect(has_wrapped_passphrase(ACCOUNT)).toBe(false);
    expect(state.delete_calls).toContain(id);
  });

  it("seals the desktop passphrase file after a PIN unlock", async () => {
    await set_up_wrapped_lock();
    state.native_file.set(ACCOUNT, "readable");
    simulate_reload();

    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
    expect(state.native_file.get(ACCOUNT)).toBe("sealed");
    for (const record of state.native_seal_records) {
      expect(record.includes(PASSPHRASE)).toBe(false);
    }
  });

  it("seals an existing desktop file on the next unlock of an older PIN", async () => {
    await set_up_legacy_lock();
    state.native_file.set(ACCOUNT, "readable");

    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
    expect(state.native_file.get(ACCOUNT)).toBe("sealed");
  });

  it("seals the desktop file after a password unlock", async () => {
    await set_up_wrapped_lock();
    state.native_file.set(ACCOUNT, "readable");
    simulate_reload();

    expect(await unlock_with_password(ACCOUNT, PASSPHRASE)).toBe(true);
    expect(state.native_file.get(ACCOUNT)).toBe("sealed");
  });

  it("leaves the desktop file alone after a wrong PIN", async () => {
    await set_up_wrapped_lock();
    state.native_file.set(ACCOUNT, "readable");
    simulate_reload();

    await attempt_app_unlock(ACCOUNT, WRONG);
    expect(state.native_seal_records).toHaveLength(0);
  });

  it("restores the desktop file when the lock is turned off", async () => {
    await set_up_wrapped_lock();
    state.native_file.set(ACCOUNT, "readable");
    await attempt_app_unlock(ACCOUNT, REGULAR);
    state.memory_passphrase = PASSPHRASE;

    expect(state.native_file.get(ACCOUNT)).toBe("sealed");
    expect(await convert_to_unwrapped(ACCOUNT)).toBe(true);
    expect(state.native_file.get(ACCOUNT)).toBe("readable");
    expect(state.native_restores).toEqual([PASSPHRASE]);
  });

  it("restores the desktop file when an older PIN is removed", async () => {
    await set_up_legacy_lock();
    state.native_file.set(ACCOUNT, "readable");
    await attempt_app_unlock(ACCOUNT, REGULAR);
    state.online = false;

    expect(state.native_file.get(ACCOUNT)).toBe("sealed");
    await remove_app_lock(ACCOUNT);
    expect(get_app_lock_config(ACCOUNT)).toBeNull();
    expect(state.native_file.get(ACCOUNT)).toBe("readable");
  });

  it("refuses to convert while still locked", async () => {
    await set_up_wrapped_lock();
    simulate_reload();

    expect(await convert_to_unwrapped(ACCOUNT)).toBe(false);
    expect(get_app_lock_config(ACCOUNT)?.kdf_version).toBe(
      KDF_VERSION_SERVER_WRAP,
    );
  });

  it("stays on the old format when the server has no app lock support", async () => {
    await set_up_legacy_lock();
    state.online = false;

    expect(await upgrade_to_server_wrap(ACCOUNT, REGULAR)).toBe(false);
    expect(get_app_lock_config(ACCOUNT)?.kdf_version).toBeUndefined();
    expect(state.unwrapped.get(ACCOUNT)?.passphrase).toBe(PASSPHRASE);
    expect(await attempt_app_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
  });
});
