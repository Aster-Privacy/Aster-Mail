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

import { base64_to_array, array_to_base64 } from "./base64";
import {
  DoubleRatchet,
  InvalidRatchetStateError,
  generate_keypair,
  type EncryptedMessage,
  type RatchetState,
  type SerializedState,
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

const MAX_COUNTER = 0x7fffffff;

async function make_pair(): Promise<{
  alice: DoubleRatchet;
  bob: DoubleRatchet;
}> {
  const shared_secret = new Uint8Array(32).fill(7);
  const bob_keypair = await generate_keypair();
  const bob = await DoubleRatchet.init_receiver(
    shared_secret,
    bob_keypair,
    "conv-limits",
  );
  const alice = await DoubleRatchet.init_sender(
    shared_secret,
    bob_keypair.public_key,
    "conv-limits",
  );

  return { alice, bob };
}

function state_of(ratchet: DoubleRatchet): RatchetState {
  return (ratchet as unknown as { state: RatchetState }).state;
}

async function unbound_copy(
  alice: DoubleRatchet,
  plaintext: string,
): Promise<EncryptedMessage> {
  const { message, message_key } =
    await alice.encrypt_returning_message_key(plaintext);
  const key = await crypto.subtle.importKey(
    "raw",
    message_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: base64_to_array(message.nonce) },
    key,
    new TextEncoder().encode(plaintext),
  );

  return { ...message, ciphertext: array_to_base64(new Uint8Array(sealed)) };
}

async function valid_serialized(): Promise<SerializedState> {
  const { alice, bob } = await make_pair();

  await bob.decrypt(await alice.encrypt("hello"));

  return JSON.parse(JSON.stringify(await bob.serialize())) as SerializedState;
}

describe("bound sessions stay bound", () => {
  it("refuses a header-bound message sealed without the header once the session is bound", async () => {
    const { alice, bob } = await make_pair();

    await expect(bob.decrypt(await alice.encrypt("first"))).resolves.toBe(
      "first",
    );
    expect(state_of(bob).header_bound).toBe(true);

    const copy = await unbound_copy(alice, "second");

    await expect(bob.decrypt(copy)).rejects.toThrow();
  });

  it("refuses an unbound copy through a skipped key once the session is bound", async () => {
    const { alice, bob } = await make_pair();

    await bob.decrypt(await alice.encrypt("first"));

    const skipped = await unbound_copy(alice, "skipped");
    const later = await alice.encrypt("later");

    await expect(bob.decrypt(later)).resolves.toBe("later");
    await expect(bob.decrypt(skipped)).rejects.toThrow();
  });

  it("still opens an unbound copy on a session that was never bound, without marking it bound", async () => {
    const { alice, bob } = await make_pair();
    const copy = await unbound_copy(alice, "old desktop");

    await expect(bob.decrypt(copy)).resolves.toBe("old desktop");
    expect(state_of(bob).header_bound).not.toBe(true);

    await expect(bob.decrypt(await alice.encrypt("current"))).resolves.toBe(
      "current",
    );
    expect(state_of(bob).header_bound).toBe(true);
  });
});

describe("ratchet counters stay in range", () => {
  it("refuses to encrypt once the send counter reaches the header limit", async () => {
    const { alice } = await make_pair();

    state_of(alice).send_message_number = MAX_COUNTER;

    await expect(alice.encrypt("too far")).rejects.toThrow();
    expect(state_of(alice).send_message_number).toBe(MAX_COUNTER);
  });

  it("never advances the send chain past the header limit", async () => {
    const { alice } = await make_pair();

    state_of(alice).send_message_number = MAX_COUNTER - 3;
    await alice.advance_send_chain_to(MAX_COUNTER + 2);

    expect(state_of(alice).send_message_number).toBeLessThanOrEqual(
      MAX_COUNTER,
    );
  });
});

describe("ratchet state loading", () => {
  it("loads a well formed state", async () => {
    const serialized = await valid_serialized();

    expect(DoubleRatchet.try_deserialize(serialized)).not.toBeNull();
    expect(() => DoubleRatchet.deserialize(serialized)).not.toThrow();
  });

  const corruptions: [string, (s: SerializedState) => void][] = [
    ["a negative send counter", (s) => (s.state.send_message_number = -1)],
    [
      "a receive counter above the header limit",
      (s) => (s.state.recv_message_number = MAX_COUNTER + 2),
    ],
    [
      "a fractional chain length",
      (s) => (s.state.previous_chain_length = 1.5),
    ],
    [
      "a missing root key",
      (s) => delete (s.state as Partial<RatchetState>).root_key,
    ],
    [
      "a numeric chain key",
      (s) => ((s.state as unknown as Record<string, unknown>).chain_key_recv = 5),
    ],
    [
      "a missing key pair",
      (s) => delete (s.state as Partial<RatchetState>).dh_keypair,
    ],
    [
      "skipped keys that are not a list",
      (s) =>
        ((s.state as unknown as Record<string, unknown>).skipped_message_keys =
          {}),
    ],
    [
      "a malformed skipped key",
      (s) =>
        s.state.skipped_message_keys.push({
          dh_public: "a",
          message_number: -4,
          message_key: "b",
          timestamp: Date.now(),
        }),
    ],
    [
      "more skipped keys than the store keeps",
      (s) => {
        s.state.skipped_message_keys = Array.from({ length: 2001 }, (_, i) => ({
          dh_public: "a",
          message_number: i,
          message_key: "b",
          timestamp: Date.now(),
        }));
      },
    ],
    [
      "a missing conversation id",
      (s) =>
        delete (s as unknown as Record<string, unknown>).conversation_id,
    ],
  ];

  for (const [label, corrupt] of corruptions) {
    it(`treats ${label} as missing state`, async () => {
      const serialized = await valid_serialized();

      corrupt(serialized);

      expect(DoubleRatchet.try_deserialize(serialized)).toBeNull();
      expect(() => DoubleRatchet.deserialize(serialized)).toThrow(
        InvalidRatchetStateError,
      );
    });
  }

  it("treats a state that is not an object as missing", () => {
    expect(
      DoubleRatchet.try_deserialize(null as unknown as SerializedState),
    ).toBeNull();
    expect(
      DoubleRatchet.try_deserialize({
        state: "x",
        conversation_id: "c",
      } as unknown as SerializedState),
    ).toBeNull();
  });
});

describe("ratchet state export", () => {
  it("hands out a copy that cannot change the live session", async () => {
    const { alice, bob } = await make_pair();

    await bob.decrypt(await alice.encrypt("one"));
    await alice.encrypt("skipped");
    await bob.decrypt(await alice.encrypt("three"));

    const before = JSON.stringify(state_of(bob));
    const exported = await bob.serialize();

    exported.state.dh_keypair.secret_key = "tampered";
    exported.state.skipped_message_keys[0].message_key = "tampered";
    exported.state.skipped_message_keys.push({
      dh_public: "x",
      message_number: 1,
      message_key: "y",
      timestamp: 0,
    });

    expect(JSON.stringify(state_of(bob))).toBe(before);
  });
});

describe("session start identity", () => {
  it("records the verified recipient identity when the session starts", async () => {
    const bob_keypair = await generate_keypair();
    const alice = await DoubleRatchet.init_sender(
      new Uint8Array(32).fill(7),
      bob_keypair.public_key,
      "conv-identity",
      "bob-identity",
    );

    expect(alice.get_remote_identity_key()).toBe("bob-identity");
  });

  it("takes the recipient identity from the bootstrap the session was started with", async () => {
    const { alice } = await make_pair();

    alice.set_bootstrap({
      ephemeral_key: "eph",
      recipient_identity_key: "bob-identity",
    });

    expect(alice.get_remote_identity_key()).toBe("bob-identity");
  });

  it("keeps an identity the session already holds", async () => {
    const { alice } = await make_pair();

    alice.set_remote_identity_key("bob-identity");
    alice.set_bootstrap({
      ephemeral_key: "eph",
      recipient_identity_key: "someone-else",
    });

    expect(alice.get_remote_identity_key()).toBe("bob-identity");
  });
});
