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

import {
  ESCROW_SEALED_LENGTH,
  ESCROW_SEED_LENGTH,
  decode_escrow_seed,
  derive_escrow_keypair,
  encode_escrow_seed,
  generate_escrow_seed,
  open_account_key_from_escrow,
  seal_account_key_to_escrow,
} from "./recovery_key_escrow";

const USER_ID = "8f4d2c11-3b9a-4f21-9d77-2b5e8c6a1d90";

function account_key(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

describe("recovery_key_escrow", () => {
  it("derives a stable keypair from a seed and user id", () => {
    const seed = generate_escrow_seed();
    const first = derive_escrow_keypair(seed, USER_ID);
    const second = derive_escrow_keypair(seed, USER_ID.toUpperCase());

    expect(seed.length).toBe(ESCROW_SEED_LENGTH);
    expect(Array.from(first.public_key)).toEqual(Array.from(second.public_key));
    expect(first.public_key.length).toBe(32);
  });

  it("derives a different keypair for a different account", () => {
    const seed = generate_escrow_seed();
    const mine = derive_escrow_keypair(seed, USER_ID);
    const theirs = derive_escrow_keypair(
      seed,
      "11111111-2222-3333-4444-555555555555",
    );

    expect(Array.from(mine.public_key)).not.toEqual(
      Array.from(theirs.public_key),
    );
  });

  it("rejects a seed that is not 32 bytes", () => {
    expect(() => derive_escrow_keypair(new Uint8Array(16), USER_ID)).toThrow();
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

  it("seals and opens an account key", async () => {
    const seed = generate_escrow_seed();
    const keypair = derive_escrow_keypair(seed, USER_ID);
    const key = account_key(7);
    const sealed = await seal_account_key_to_escrow(
      key,
      keypair.public_key,
      USER_ID,
      3,
    );
    const opened = await open_account_key_from_escrow(
      sealed,
      keypair.private_key,
      USER_ID,
      3,
    );

    expect(opened && Array.from(opened)).toEqual(Array.from(key));
  });

  it("produces a sealed blob the server accepts", async () => {
    const keypair = derive_escrow_keypair(generate_escrow_seed(), USER_ID);
    const sealed = await seal_account_key_to_escrow(
      account_key(1),
      keypair.public_key,
      USER_ID,
      1,
    );

    expect(atob(sealed).length).toBe(ESCROW_SEALED_LENGTH);
  });

  it("does not repeat a sealed blob for the same key", async () => {
    const keypair = derive_escrow_keypair(generate_escrow_seed(), USER_ID);
    const first = await seal_account_key_to_escrow(
      account_key(2),
      keypair.public_key,
      USER_ID,
      1,
    );
    const second = await seal_account_key_to_escrow(
      account_key(2),
      keypair.public_key,
      USER_ID,
      1,
    );

    expect(first).not.toBe(second);
  });

  it("refuses to open under a different token version", async () => {
    const keypair = derive_escrow_keypair(generate_escrow_seed(), USER_ID);
    const sealed = await seal_account_key_to_escrow(
      account_key(4),
      keypair.public_key,
      USER_ID,
      2,
    );

    expect(
      await open_account_key_from_escrow(sealed, keypair.private_key, USER_ID, 3),
    ).toBeNull();
  });

  it("refuses to open under a different account", async () => {
    const keypair = derive_escrow_keypair(generate_escrow_seed(), USER_ID);
    const sealed = await seal_account_key_to_escrow(
      account_key(5),
      keypair.public_key,
      USER_ID,
      1,
    );

    expect(
      await open_account_key_from_escrow(
        sealed,
        keypair.private_key,
        "11111111-2222-3333-4444-555555555555",
        1,
      ),
    ).toBeNull();
  });

  it("refuses to open with the wrong escrow key", async () => {
    const mine = derive_escrow_keypair(generate_escrow_seed(), USER_ID);
    const theirs = derive_escrow_keypair(generate_escrow_seed(), USER_ID);
    const sealed = await seal_account_key_to_escrow(
      account_key(6),
      mine.public_key,
      USER_ID,
      1,
    );

    expect(
      await open_account_key_from_escrow(sealed, theirs.private_key, USER_ID, 1),
    ).toBeNull();
  });

  it("refuses a tampered blob", async () => {
    const keypair = derive_escrow_keypair(generate_escrow_seed(), USER_ID);
    const sealed = await seal_account_key_to_escrow(
      account_key(8),
      keypair.public_key,
      USER_ID,
      1,
    );
    const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));

    bytes[80] ^= 0xff;

    const tampered = btoa(String.fromCharCode(...bytes));

    expect(
      await open_account_key_from_escrow(
        tampered,
        keypair.private_key,
        USER_ID,
        1,
      ),
    ).toBeNull();
  });

  it("refuses a blob of the wrong size or bad base64", async () => {
    const keypair = derive_escrow_keypair(generate_escrow_seed(), USER_ID);

    expect(
      await open_account_key_from_escrow(
        btoa("short"),
        keypair.private_key,
        USER_ID,
        1,
      ),
    ).toBeNull();
    expect(
      await open_account_key_from_escrow(
        "!!!not base64!!!",
        keypair.private_key,
        USER_ID,
        1,
      ),
    ).toBeNull();
  });

  it("refuses to seal a key that is not 32 bytes", async () => {
    const keypair = derive_escrow_keypair(generate_escrow_seed(), USER_ID);

    await expect(
      seal_account_key_to_escrow(
        new Uint8Array(16),
        keypair.public_key,
        USER_ID,
        1,
      ),
    ).rejects.toThrow();
  });

  it("refuses a token version below one", async () => {
    const keypair = derive_escrow_keypair(generate_escrow_seed(), USER_ID);

    await expect(
      seal_account_key_to_escrow(account_key(9), keypair.public_key, USER_ID, 0),
    ).rejects.toThrow();
  });
});
