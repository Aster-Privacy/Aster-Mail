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

const tag_key = vi.hoisted(() => ({
  current: null as CryptoKey | null,
  available: true,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_or_create_derived_encryption_crypto_key: async () => {
    if (!tag_key.available) return null;
    if (!tag_key.current) {
      tag_key.current = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    }

    return tag_key.current;
  },
}));

import {
  attempt_pin_unlock,
  clear_all_app_lock_data,
  clear_duress_pin,
  duress_pin_correct,
  generate_pin_salt,
  get_app_lock_config,
  has_duress_pin,
  hash_pin,
  is_locked_out,
  save_app_lock_config,
  save_duress_pin,
} from "@/services/app_lock_store";

const ACCOUNT = "acct-duress";
const REGULAR = "1234";
const DURESS = "9999";
const WRONG = "0000";

const to_hex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function set_up_lock(with_duress: boolean) {
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
}

async function exhaust_attempts() {
  for (let i = 0; i < 5; i++) {
    await attempt_pin_unlock(ACCOUNT, WRONG);
  }
  expect(is_locked_out(ACCOUNT).locked).toBe(true);
}

describe("duress PIN on the lock screen", () => {
  beforeEach(() => {
    tag_key.available = true;
    clear_all_app_lock_data();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clear_all_app_lock_data();
  });

  it("still triggers while the lock screen is locked out", async () => {
    await set_up_lock(true);
    await exhaust_attempts();

    expect(await attempt_pin_unlock(ACCOUNT, DURESS)).toEqual({
      outcome: "duress",
    });
  });

  it("keeps the regular PIN refused during a lockout", async () => {
    await set_up_lock(true);
    await exhaust_attempts();

    const result = await attempt_pin_unlock(ACCOUNT, REGULAR);

    expect(result.outcome).toBe("locked_out");
  });

  it("does not count a duress entry as a failed attempt", async () => {
    await set_up_lock(true);
    await attempt_pin_unlock(ACCOUNT, DURESS);

    expect(await attempt_pin_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
  });

  it("does the same hashing work with or without a duress PIN", async () => {
    const counts: number[] = [];

    for (const with_duress of [false, true]) {
      clear_all_app_lock_data();
      await set_up_lock(with_duress);
      const spy = vi.spyOn(crypto.subtle, "deriveBits");

      await attempt_pin_unlock(ACCOUNT, WRONG);
      counts.push(spy.mock.calls.length);
      spy.mockRestore();
    }

    expect(counts).toEqual([2, 2]);
  });

  it("never treats a random PIN as duress when none is set", async () => {
    await set_up_lock(false);

    const result = await attempt_pin_unlock(ACCOUNT, DURESS);

    expect(result.outcome).toBe("failed");
  });

  it("unlocks with the regular PIN when no duress PIN is set", async () => {
    await set_up_lock(false);

    expect(await attempt_pin_unlock(ACCOUNT, REGULAR)).toEqual({
      outcome: "unlocked",
    });
  });
});

describe("duress PIN in stored settings", () => {
  const shape = (account: string) => {
    const config = get_app_lock_config(account)!;

    return Object.keys(config)
      .sort()
      .map((key) => {
        const value = config[key as keyof typeof config];

        return `${key}:${typeof value}:${typeof value === "string" ? value.length : value}`;
      });
  };

  beforeEach(() => {
    tag_key.available = true;
    tag_key.current = null;
    clear_all_app_lock_data();
  });
  afterEach(() => clear_all_app_lock_data());

  it("stores the same fields whether or not a duress PIN is set", async () => {
    await set_up_lock(false);
    const without = shape(ACCOUNT);

    clear_all_app_lock_data();
    await set_up_lock(true);

    expect(shape(ACCOUNT)).toEqual(without);
    expect(without.some((entry) => entry.startsWith("duress_pin_hash:"))).toBe(
      true,
    );
  });

  it("reports the duress PIN only after it is set", async () => {
    await set_up_lock(false);
    expect(await has_duress_pin(ACCOUNT)).toBe(false);

    clear_all_app_lock_data();
    await set_up_lock(true);
    expect(await has_duress_pin(ACCOUNT)).toBe(true);
  });

  it("goes back to decoy fields when the duress PIN is removed", async () => {
    await set_up_lock(true);
    const with_duress = shape(ACCOUNT);

    clear_duress_pin(ACCOUNT);

    expect(shape(ACCOUNT)).toEqual(with_duress);
    expect(await has_duress_pin(ACCOUNT)).toBe(false);
    expect(await duress_pin_correct(ACCOUNT, DURESS)).toBe(false);
    expect((await attempt_pin_unlock(ACCOUNT, DURESS)).outcome).toBe("failed");
  });

  it("never matches a PIN against the decoy fields", async () => {
    await set_up_lock(false);

    for (const pin of [REGULAR, DURESS, WRONG, ""]) {
      expect(await duress_pin_correct(ACCOUNT, pin)).toBe(false);
    }
  });

  it("keeps a legacy duress PIN working and adds its tag", async () => {
    await set_up_lock(true);
    const { duress_tag: _t, ...legacy } = get_app_lock_config(ACCOUNT)!;

    localStorage.setItem(`aster:app_lock:${ACCOUNT}`, JSON.stringify(legacy));

    expect(await has_duress_pin(ACCOUNT)).toBe(true);
    expect(get_app_lock_config(ACCOUNT)!.duress_tag).toMatch(/^[0-9a-f]{88}$/);
    expect(await has_duress_pin(ACCOUNT)).toBe(true);
    expect(await attempt_pin_unlock(ACCOUNT, DURESS)).toEqual({
      outcome: "duress",
    });
  });

  it("does not accept a tag copied from another account", async () => {
    await set_up_lock(true);
    const source = get_app_lock_config(ACCOUNT)!;

    save_app_lock_config("acct-other", { ...source });

    expect(await has_duress_pin("acct-other")).toBe(false);
  });

  it("reports no duress PIN when the account key is unavailable", async () => {
    await set_up_lock(true);
    tag_key.available = false;

    expect(await has_duress_pin(ACCOUNT)).toBe(false);
    expect(await attempt_pin_unlock(ACCOUNT, DURESS)).toEqual({
      outcome: "duress",
    });
  });
});
