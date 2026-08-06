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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as openpgp from "openpgp";

import {
  decrypt_message,
  decrypt_message_with_any_key,
  clear_unlocked_key_cache,
} from "./key_manager_pgp";

const unlock_counter = vi.hoisted(() => ({ count: 0 }));

vi.mock("openpgp", async (import_original) => {
  const actual = await import_original<typeof import("openpgp")>();

  return {
    ...actual,
    decryptKey: (...args: Parameters<typeof actual.decryptKey>) => {
      unlock_counter.count += 1;

      return actual.decryptKey(...args);
    },
  };
});

const pass = "unlock-cache-pw";

async function make_key(email: string, passphrase: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: email, email }],
    passphrase,
    format: "armored",
  });
}

async function encrypt_to(public_key_armored: string, text: string) {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: public_key_armored }),
    format: "armored",
  })) as string;
}

describe("unlocked private key cache", () => {
  beforeEach(() => {
    clear_unlocked_key_cache();
    unlock_counter.count = 0;
  });

  afterEach(() => {
    clear_unlocked_key_cache();
  });

  it("unlocks the private key once across many message decrypts", async () => {
    const a = await make_key("a@x.com", pass);
    const messages = await Promise.all(
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        encrypt_to(a.publicKey, `message-${i}`),
      ),
    );

    unlock_counter.count = 0;

    const results = [];

    for (const ct of messages) {
      results.push(await decrypt_message(ct, a.privateKey, pass));
    }

    expect(results).toEqual([
      "message-0",
      "message-1",
      "message-2",
      "message-3",
      "message-4",
      "message-5",
      "message-6",
      "message-7",
    ]);
    expect(unlock_counter.count).toBe(1);
  });

  it("shares a single unlock across concurrent decrypts", async () => {
    const a = await make_key("a@x.com", pass);
    const messages = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((i) => encrypt_to(a.publicKey, `parallel-${i}`)),
    );

    unlock_counter.count = 0;

    const results = await Promise.all(
      messages.map((ct) => decrypt_message(ct, a.privateKey, pass)),
    );

    expect(results).toEqual([
      "parallel-0",
      "parallel-1",
      "parallel-2",
      "parallel-3",
      "parallel-4",
      "parallel-5",
    ]);
    expect(unlock_counter.count).toBe(1);
  });

  it("still decrypts after the cache is cleared", async () => {
    const a = await make_key("a@x.com", pass);
    const ct = await encrypt_to(a.publicKey, "after-clear");

    expect(await decrypt_message(ct, a.privateKey, pass)).toBe("after-clear");

    clear_unlocked_key_cache();

    expect(await decrypt_message(ct, a.privateKey, pass)).toBe("after-clear");
  });

  it("does not cache a failed unlock", async () => {
    const a = await make_key("a@x.com", pass);
    const ct = await encrypt_to(a.publicKey, "wrong-pass");

    await expect(
      decrypt_message(ct, a.privateKey, "not-the-passphrase"),
    ).rejects.toThrow();

    await expect(
      decrypt_message(ct, a.privateKey, "not-the-passphrase"),
    ).rejects.toThrow();

    expect(await decrypt_message(ct, a.privateKey, pass)).toBe("wrong-pass");
  });

  it("keeps separate entries per key and per passphrase", async () => {
    const a = await make_key("a@x.com", pass);
    const b = await make_key("b@x.com", "other-pw");
    const ct_a = await encrypt_to(a.publicKey, "from-a");
    const ct_b = await encrypt_to(b.publicKey, "from-b");

    expect(
      await decrypt_message_with_any_key(
        ct_b,
        [a.privateKey, b.privateKey],
        "other-pw",
      ),
    ).toBe("from-b");
    expect(await decrypt_message(ct_a, a.privateKey, pass)).toBe("from-a");
  });
});
