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
import { describe, expect, it } from "vitest";

import { array_to_base64 } from "./base64";
import { seal_legacy_escrow_entry } from "./recovery_escrow_fixtures";
import {
  ESCROW_SEALED_LENGTH,
  ESCROW_SEED_LENGTH,
  decode_escrow_seed,
  derive_escrow_keys,
  derive_legacy_escrow_keypair,
  encode_escrow_seed,
  generate_escrow_seed,
  open_account_key_from_escrow,
  open_legacy_account_key_from_escrow,
  seal_account_key_to_escrow,
  zero_escrow_keys,
} from "./recovery_key_escrow";

const USER_ID = "8f4d2c11-3b9a-4f21-9d77-2b5e8c6a1d90";
const OTHER_USER_ID = "11111111-2222-3333-4444-555555555555";

function account_key(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

function fresh_keys() {
  return derive_escrow_keys(generate_escrow_seed(), USER_ID);
}

describe("recovery_key_escrow", () => {
  it("derives stable keys from a seed and user id", () => {
    const seed = generate_escrow_seed();
    const first = derive_escrow_keys(seed, USER_ID);
    const second = derive_escrow_keys(seed, USER_ID.toUpperCase());

    expect(seed.length).toBe(ESCROW_SEED_LENGTH);
    expect(Array.from(first.public_key)).toEqual(Array.from(second.public_key));
    expect(Array.from(first.auth_key)).toEqual(Array.from(second.auth_key));
    expect(first.public_key.length).toBe(32);
    expect(first.auth_key.length).toBe(32);
  });

  it("derives different keys for a different account", () => {
    const seed = generate_escrow_seed();
    const mine = derive_escrow_keys(seed, USER_ID);
    const theirs = derive_escrow_keys(seed, OTHER_USER_ID);

    expect(Array.from(mine.public_key)).not.toEqual(
      Array.from(theirs.public_key),
    );
    expect(Array.from(mine.auth_key)).not.toEqual(Array.from(theirs.auth_key));
  });

  it("publishes a different key than the legacy format", () => {
    const seed = generate_escrow_seed();
    const current = derive_escrow_keys(seed, USER_ID);
    const legacy = derive_legacy_escrow_keypair(seed, USER_ID);

    expect(Array.from(current.public_key)).not.toEqual(
      Array.from(legacy.public_key),
    );
  });

  it("rejects a seed that is not 32 bytes", () => {
    expect(() => derive_escrow_keys(new Uint8Array(16), USER_ID)).toThrow();
    expect(() =>
      derive_legacy_escrow_keypair(new Uint8Array(16), USER_ID),
    ).toThrow();
  });

  it("round-trips a seed through base64", () => {
    const seed = generate_escrow_seed();
    const decoded = decode_escrow_seed(encode_escrow_seed(seed));

    expect(decoded && Array.from(decoded)).toEqual(Array.from(seed));
  });

  it("refuses a seed of the wrong length or bad base64", () => {
    expect(decode_escrow_seed(encode_escrow_seed(new Uint8Array(8)))).toBeNull();
    expect(decode_escrow_seed("!!!not base64!!!")).toBeNull();
  });

  it("zeroes derived secrets", () => {
    const keys = fresh_keys();

    zero_escrow_keys(keys);

    expect(keys.private_key.every((byte) => byte === 0)).toBe(true);
    expect(keys.auth_key.every((byte) => byte === 0)).toBe(true);
    expect(() => zero_escrow_keys(null)).not.toThrow();
  });

  it("seals and opens an account key", async () => {
    const keys = fresh_keys();
    const key = account_key(7);
    const sealed = await seal_account_key_to_escrow(key, keys, USER_ID, 3);
    const opened = await open_account_key_from_escrow(sealed, keys, USER_ID, 3);

    expect(opened && Array.from(opened)).toEqual(Array.from(key));
  });

  it("produces a sealed blob the server accepts", async () => {
    const sealed = await seal_account_key_to_escrow(
      account_key(1),
      fresh_keys(),
      USER_ID,
      1,
    );

    expect(atob(sealed).length).toBe(ESCROW_SEALED_LENGTH);
  });

  it("does not repeat a sealed blob for the same key", async () => {
    const keys = fresh_keys();
    const first = await seal_account_key_to_escrow(
      account_key(2),
      keys,
      USER_ID,
      1,
    );
    const second = await seal_account_key_to_escrow(
      account_key(2),
      keys,
      USER_ID,
      1,
    );

    expect(first).not.toBe(second);
  });

  it("refuses an entry sealed to the published key without the seed", async () => {
    const keys = fresh_keys();
    const forged_with_guess = await seal_account_key_to_escrow(
      account_key(9),
      {
        public_key: keys.public_key,
        auth_key: crypto.getRandomValues(new Uint8Array(32)),
      },
      USER_ID,
      5,
    );
    const forged_legacy_style = await seal_legacy_escrow_entry(
      account_key(9),
      keys.public_key,
      USER_ID,
      5,
    );

    expect(
      await open_account_key_from_escrow(forged_with_guess, keys, USER_ID, 5),
    ).toBeNull();
    expect(
      await open_account_key_from_escrow(forged_legacy_style, keys, USER_ID, 5),
    ).toBeNull();
  });

  it("refuses an entry without bound context", async () => {
    const keys = fresh_keys();
    const unbound = await seal_legacy_escrow_entry(
      account_key(3),
      keys.public_key,
      USER_ID,
      1,
      false,
    );

    expect(
      await open_account_key_from_escrow(unbound, keys, USER_ID, 1),
    ).toBeNull();
  });

  it("refuses to open under a different token version", async () => {
    const keys = fresh_keys();
    const sealed = await seal_account_key_to_escrow(
      account_key(4),
      keys,
      USER_ID,
      2,
    );

    expect(
      await open_account_key_from_escrow(sealed, keys, USER_ID, 3),
    ).toBeNull();
  });

  it("refuses to open under a different account", async () => {
    const keys = fresh_keys();
    const sealed = await seal_account_key_to_escrow(
      account_key(5),
      keys,
      USER_ID,
      1,
    );

    expect(
      await open_account_key_from_escrow(sealed, keys, OTHER_USER_ID, 1),
    ).toBeNull();
  });

  it("refuses to open with the wrong escrow key", async () => {
    const sealed = await seal_account_key_to_escrow(
      account_key(6),
      fresh_keys(),
      USER_ID,
      1,
    );

    expect(
      await open_account_key_from_escrow(sealed, fresh_keys(), USER_ID, 1),
    ).toBeNull();
  });

  it("refuses a tampered blob", async () => {
    const keys = fresh_keys();
    const sealed = await seal_account_key_to_escrow(
      account_key(8),
      keys,
      USER_ID,
      1,
    );
    const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));

    bytes[80] ^= 0xff;

    expect(
      await open_account_key_from_escrow(
        array_to_base64(bytes),
        keys,
        USER_ID,
        1,
      ),
    ).toBeNull();
  });

  it("refuses a blob of the wrong size or bad base64", async () => {
    const keys = fresh_keys();

    expect(
      await open_account_key_from_escrow(btoa("short"), keys, USER_ID, 1),
    ).toBeNull();
    expect(
      await open_account_key_from_escrow("!!!not base64!!!", keys, USER_ID, 1),
    ).toBeNull();
  });

  it("refuses a token version that is not a positive integer", async () => {
    const keys = fresh_keys();
    const sealed = await seal_account_key_to_escrow(
      account_key(2),
      keys,
      USER_ID,
      1,
    );

    expect(
      await open_account_key_from_escrow(sealed, keys, USER_ID, 0),
    ).toBeNull();
    expect(
      await open_account_key_from_escrow(sealed, keys, USER_ID, 1.5),
    ).toBeNull();
    await expect(
      seal_account_key_to_escrow(account_key(9), keys, USER_ID, 0),
    ).rejects.toThrow();
  });

  it("refuses to seal a key that is not 32 bytes", async () => {
    await expect(
      seal_account_key_to_escrow(new Uint8Array(16), fresh_keys(), USER_ID, 1),
    ).rejects.toThrow();
  });

  it("opens a legacy entry bound to its context", async () => {
    const legacy = derive_legacy_escrow_keypair(generate_escrow_seed(), USER_ID);
    const sealed = await seal_legacy_escrow_entry(
      account_key(4),
      legacy.public_key,
      USER_ID,
      2,
    );
    const opened = await open_legacy_account_key_from_escrow(
      sealed,
      legacy.private_key,
      USER_ID,
      2,
    );

    expect(opened && Array.from(opened)).toEqual(Array.from(account_key(4)));
    expect(
      await open_legacy_account_key_from_escrow(
        sealed,
        legacy.private_key,
        USER_ID,
        3,
      ),
    ).toBeNull();
  });

  it("opens a legacy entry written without bound context", async () => {
    const legacy = derive_legacy_escrow_keypair(generate_escrow_seed(), USER_ID);
    const sealed = await seal_legacy_escrow_entry(
      account_key(6),
      legacy.public_key,
      USER_ID,
      1,
      false,
    );
    const opened = await open_legacy_account_key_from_escrow(
      sealed,
      legacy.private_key,
      USER_ID,
      1,
    );

    expect(opened && Array.from(opened)).toEqual(Array.from(account_key(6)));
  });
});
