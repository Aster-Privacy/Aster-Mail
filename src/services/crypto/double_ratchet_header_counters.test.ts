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
import { describe, it, expect, vi } from "vitest";

import {
  DoubleRatchet,
  generate_keypair,
  type EncryptedMessage,
  type RatchetState,
} from "./double_ratchet";

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(),
  encrypted_set: vi.fn(),
  encrypted_delete: vi.fn(),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

async function make_pair(): Promise<{
  alice: DoubleRatchet;
  bob: DoubleRatchet;
}> {
  const shared_secret = new Uint8Array(32).fill(7);
  const bob_keypair = await generate_keypair();
  const bob = await DoubleRatchet.init_receiver(
    shared_secret,
    bob_keypair,
    "conv-1",
  );
  const alice = await DoubleRatchet.init_sender(
    shared_secret,
    bob_keypair.public_key,
    "conv-1",
  );

  return { alice, bob };
}

function snapshot(ratchet: DoubleRatchet): string {
  return JSON.stringify((ratchet as unknown as { state: RatchetState }).state);
}

function with_header(
  message: EncryptedMessage,
  fields: Record<string, unknown>,
): EncryptedMessage {
  return {
    ...message,
    header: { ...message.header, ...fields },
  } as unknown as EncryptedMessage;
}

const bad_counters: [string, unknown][] = [
  ["a negative number", -1],
  ["a fraction", 0.5],
  ["not a number", Number.NaN],
  ["infinity", Number.POSITIVE_INFINITY],
  ["a number above the 31-bit range", 2 ** 31],
  ["a number that wraps to zero in 32 bits", 2 ** 32],
  ["a string", "0"],
  ["null", null],
  ["a missing value", undefined],
];

describe("ratchet header counters", () => {
  for (const [label, value] of bad_counters) {
    it(`refuses a message number that is ${label} and keeps the state`, async () => {
      const { alice, bob } = await make_pair();
      const message = with_header(await alice.encrypt("one"), {
        message_number: value,
      });
      const before = snapshot(bob);

      await expect(bob.decrypt(message)).rejects.toThrow(/header/i);
      expect(snapshot(bob)).toBe(before);
    });

    it(`refuses a previous chain length that is ${label} and keeps the state`, async () => {
      const { alice, bob } = await make_pair();
      const message = with_header(await alice.encrypt("one"), {
        previous_chain_length: value,
      });
      const before = snapshot(bob);

      await expect(bob.decrypt(message)).rejects.toThrow(/header/i);
      expect(snapshot(bob)).toBe(before);
    });
  }

  it("refuses a malformed header when opening with a message key", async () => {
    const { alice } = await make_pair();
    const sealed = await alice.encrypt_returning_message_key("one");

    await expect(
      DoubleRatchet.decrypt_with_message_key(
        with_header(sealed.message, { message_number: 2 ** 32 }),
        sealed.message_key,
      ),
    ).rejects.toThrow(/header/i);
  });

  it("refuses a header whose ratchet key is not text", async () => {
    const { alice, bob } = await make_pair();
    const message = with_header(await alice.encrypt("one"), { dh_public: 7 });

    await expect(bob.decrypt(message)).rejects.toThrow(/header/i);
  });

  it("still opens well-formed messages in and out of order", async () => {
    const { alice, bob } = await make_pair();
    const first = await alice.encrypt("one");
    const second = await alice.encrypt("two");

    expect(await bob.decrypt(second)).toBe("two");
    expect(await bob.decrypt(first)).toBe("one");
    expect(await alice.decrypt(await bob.encrypt("three"))).toBe("three");
  });
});
