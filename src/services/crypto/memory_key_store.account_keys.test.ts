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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  store_vault_in_memory,
  clear_vault_from_memory,
  wait_for_account_key_load,
} from "./memory_key_store";
import {
  get_account_data_write_key,
  get_account_key_generation,
  get_account_write_epoch,
  load_account_key_derived_keks_into_memory,
} from "./legacy_keks";

import { subtle_crypto_mock } from "@/tests/setup";

const loader = vi.hoisted(() => ({
  load_account_keys_for_session: vi.fn(),
}));

vi.mock("./account_key_loader", () => loader);

function build_vault(identity_key = "identity"): EncryptedVault {
  return {
    identity_key,
    previous_keys: [],
    signed_prekey: "signed_prekey_public",
    signed_prekey_private: "signed_prekey_private",
    recovery_codes: [],
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("account key pool across vault reloads", () => {
  beforeEach(() => {
    subtle_crypto_mock.importKey.mockResolvedValue({} as CryptoKey);
    subtle_crypto_mock.deriveBits.mockResolvedValue(new Uint8Array(32).buffer);
    subtle_crypto_mock.digest.mockResolvedValue(new Uint8Array(32).buffer);
    loader.load_account_keys_for_session.mockReset();
    loader.load_account_keys_for_session.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    clear_vault_from_memory();
  });

  it("keeps the pool when the same account reloads its vault", async () => {
    await store_vault_in_memory(build_vault(), "pw", "user-a");
    await flush();
    const generation = get_account_key_generation();

    await store_vault_in_memory(build_vault(), "pw", "user-a");
    await store_vault_in_memory(build_vault(), "pw");
    await flush();

    expect(get_account_key_generation()).toBe(generation);
    expect(loader.load_account_keys_for_session).toHaveBeenCalledTimes(1);
  });

  it("loads again when a reload adds keys to the vault", async () => {
    await store_vault_in_memory(build_vault(), "pw", "user-a");
    await flush();
    const generation = get_account_key_generation();

    await store_vault_in_memory(
      { ...build_vault(), previous_keys: ["reactivated"] },
      "pw",
      "user-a",
    );
    await flush();

    expect(get_account_key_generation()).toBe(generation);
    expect(loader.load_account_keys_for_session).toHaveBeenCalledTimes(2);
    expect(
      loader.load_account_keys_for_session.mock.calls[1][0].previous_keys,
    ).toEqual(["reactivated"]);
  });

  it("clears the pool when a different account stores its vault", async () => {
    await store_vault_in_memory(build_vault(), "pw", "user-a");
    await flush();
    const generation = get_account_key_generation();

    await store_vault_in_memory(build_vault("other"), "pw", "user-b");
    await flush();

    expect(get_account_key_generation()).toBeGreaterThan(generation);
    expect(loader.load_account_keys_for_session).toHaveBeenCalledTimes(2);
  });

  it("clears the pool on sign-out", async () => {
    await store_vault_in_memory(build_vault(), "pw", "user-a");
    await flush();
    const generation = get_account_key_generation();

    clear_vault_from_memory();

    expect(get_account_key_generation()).toBeGreaterThan(generation);
  });

  it("retries a failed load with the latest vault", async () => {
    vi.useFakeTimers();
    loader.load_account_keys_for_session
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(1);

    await store_vault_in_memory(build_vault(), "pw", "user-a");
    await vi.advanceTimersByTimeAsync(0);
    await store_vault_in_memory(build_vault("rotated"), "pw2", "user-a");
    await vi.advanceTimersByTimeAsync(2000);

    expect(loader.load_account_keys_for_session).toHaveBeenCalledTimes(2);
    const [vault, passphrase] =
      loader.load_account_keys_for_session.mock.calls[1];

    expect(vault.identity_key).toBe("rotated");
    expect(passphrase).toBe("pw2");
  });

  it("stops retrying after sign-out", async () => {
    vi.useFakeTimers();
    loader.load_account_keys_for_session.mockRejectedValue(
      new Error("offline"),
    );

    await store_vault_in_memory(build_vault(), "pw", "user-a");
    await vi.advanceTimersByTimeAsync(0);
    clear_vault_from_memory();
    await vi.advanceTimersByTimeAsync(120000);

    expect(loader.load_account_keys_for_session).toHaveBeenCalledTimes(1);
  });
});

function deferred(): { promise: Promise<number>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<number>((done) => {
    resolve = () => done(1);
  });

  return { promise, resolve };
}

async function settled(promise: Promise<void>): Promise<boolean> {
  let done = false;

  promise.then(() => {
    done = true;
  });
  await flush();

  return done;
}

describe("waiting for the account key load", () => {
  beforeEach(() => {
    loader.load_account_keys_for_session.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    clear_vault_from_memory();
  });

  it("resolves at once when no load is pending", async () => {
    clear_vault_from_memory();

    expect(await settled(wait_for_account_key_load(60000))).toBe(true);
  });

  it("resolves when the pending load finishes", async () => {
    const load = deferred();

    loader.load_account_keys_for_session.mockReturnValue(load.promise);
    await store_vault_in_memory(build_vault(), "pw", "user-a");
    const wait = wait_for_account_key_load(60000);

    expect(await settled(wait)).toBe(false);
    load.resolve();
    expect(await settled(wait)).toBe(true);
  });

  it("resolves after the timeout when the load hangs", async () => {
    vi.useFakeTimers();
    loader.load_account_keys_for_session.mockReturnValue(new Promise(() => {}));
    await store_vault_in_memory(build_vault(), "pw", "user-a");
    let done = false;

    wait_for_account_key_load(5000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it("resolves on sign-out", async () => {
    loader.load_account_keys_for_session.mockReturnValue(new Promise(() => {}));
    await store_vault_in_memory(build_vault(), "pw", "user-a");
    const wait = wait_for_account_key_load(60000);

    clear_vault_from_memory();

    expect(await settled(wait)).toBe(true);
  });

  it("keeps waiting for a newer load when an older one finishes", async () => {
    const first = deferred();
    const second = deferred();

    loader.load_account_keys_for_session
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await store_vault_in_memory(build_vault(), "pw", "user-a");
    await flush();
    await store_vault_in_memory(
      { ...build_vault(), previous_keys: ["reactivated"] },
      "pw",
      "user-a",
    );
    const wait = wait_for_account_key_load(60000);

    first.resolve();
    expect(await settled(wait)).toBe(false);
    second.resolve();
    expect(await settled(wait)).toBe(true);
  });

  it("drops the write keys when a new load starts", async () => {
    loader.load_account_keys_for_session.mockReturnValue(new Promise(() => {}));
    subtle_crypto_mock.importKey.mockResolvedValue({} as CryptoKey);
    subtle_crypto_mock.deriveBits.mockResolvedValue(new Uint8Array(32).buffer);
    subtle_crypto_mock.digest.mockResolvedValue(new Uint8Array(32).buffer);
    await load_account_key_derived_keks_into_memory(
      new Uint8Array(32),
      get_account_key_generation(),
      get_account_write_epoch(),
    );
    expect(get_account_data_write_key("astermail-draft-v2")).not.toBeNull();

    await store_vault_in_memory(build_vault(), "pw", "user-a");

    expect(get_account_data_write_key("astermail-draft-v2")).toBeNull();
  });
});
