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
  release_app_lock,
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
