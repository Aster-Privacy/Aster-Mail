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
import { merge_ratchet_states } from "./ratchet_state_merge";

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

function state_of(ratchet: DoubleRatchet): RatchetState {
  return (ratchet as unknown as { state: RatchetState }).state;
}

function with_header_version(
  message: EncryptedMessage,
  v: number | undefined,
): EncryptedMessage {
  return { ...message, header: { ...message.header, v } };
}

describe("ratchet header binding pin", () => {
  it("starts a session without the pin", async () => {
    const { bob } = await make_pair();

    expect(state_of(bob).header_bound).toBeUndefined();
  });

  it("pins a session once a bound header decrypts", async () => {
    const { alice, bob } = await make_pair();

    expect(await bob.decrypt(await alice.encrypt("one"))).toBe("one");
    expect(state_of(bob).header_bound).toBe(true);
  });

  it("refuses an unbound header on a pinned session and keeps the state", async () => {
    const { alice, bob } = await make_pair();

    await bob.decrypt(await alice.encrypt("one"));

    const second = await alice.encrypt("two");
    const before = JSON.stringify(state_of(bob));

    await expect(bob.decrypt(with_header_version(second, 1))).rejects.toThrow(
      /unbound header/,
    );
    await expect(
      bob.decrypt(with_header_version(second, undefined)),
    ).rejects.toThrow(/unbound header/);
    expect(JSON.stringify(state_of(bob))).toBe(before);
    expect(await bob.decrypt(second)).toBe("two");
  });

  it("pins a session when a skipped message arrives with a bound header", async () => {
    const { alice, bob } = await make_pair();
    const first = await alice.encrypt("one");
    const second = await alice.encrypt("two");

    await bob.decrypt(second);
    state_of(bob).header_bound = undefined;

    expect(await bob.decrypt(first)).toBe("one");
    expect(state_of(bob).header_bound).toBe(true);
  });

  it("does not pin a session on a failed decrypt", async () => {
    const { alice, bob } = await make_pair();
    const first = await alice.encrypt("one");
    const tampered = { ...first, nonce: first.nonce.replace(/^./, "A") };

    if (tampered.nonce === first.nonce) {
      tampered.nonce = first.nonce.replace(/^./, "B");
    }

    await expect(bob.decrypt(tampered)).rejects.toThrow();
    expect(state_of(bob).header_bound).toBeUndefined();
  });

  it("keeps the pin through serialization", async () => {
    const { alice, bob } = await make_pair();

    await bob.decrypt(await alice.encrypt("one"));

    const restored = await DoubleRatchet.deserialize(await bob.serialize());

    await expect(
      restored.decrypt(with_header_version(await alice.encrypt("two"), 1)),
    ).rejects.toThrow(/unbound header/);
  });

  it("keeps the pin when either side of a merge has it", async () => {
    const { alice, bob } = await make_pair();
    const unpinned = await bob.serialize();

    await bob.decrypt(await alice.encrypt("one"));

    const pinned = await bob.serialize();

    expect(
      merge_ratchet_states(pinned, unpinned).state.header_bound,
    ).toBe(true);
    expect(
      merge_ratchet_states(unpinned, pinned).state.header_bound,
    ).toBe(true);
    expect(
      merge_ratchet_states(unpinned, unpinned).state.header_bound,
    ).toBeFalsy();
  });
});
