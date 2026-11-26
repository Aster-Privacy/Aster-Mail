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
import type { SerializedState, SkippedMessageKey } from "./double_ratchet";

import { describe, it, expect, vi } from "vitest";

import { DoubleRatchet, generate_keypair } from "./double_ratchet";
import {
  MAX_RECEIVED_CHAINS,
  record_received_chain,
} from "./ratchet_received_chains";
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

const CONVERSATION = "conversation-consumed-keys";

function skipped(dh_public: string, message_number: number): SkippedMessageKey {
  return {
    dh_public,
    message_number,
    message_key: `key-${dh_public}-${message_number}`,
    timestamp: 1_000 + message_number,
  };
}

function make_state(overrides: Record<string, unknown> = {}): SerializedState {
  return {
    conversation_id: CONVERSATION,
    state: {
      dh_keypair: { public_key: "local-dh-pub", secret_key: "local-dh-sec" },
      dh_remote_public: "remote-dh-pub",
      root_key: "root-key-epoch-1",
      chain_key_send: "send-chain-0",
      chain_key_recv: "recv-chain-0",
      send_message_number: 0,
      recv_message_number: 0,
      previous_chain_length: 0,
      epoch: 0,
      skipped_message_keys: [],
      version: 2,
      dirty_since_sync: false,
      created_at: 1_000,
      updated_at: 1_000,
      ...overrides,
    },
  } as SerializedState;
}

function key_ids(state: SerializedState): string[] {
  return state.state.skipped_message_keys
    .map((key) => `${key.dh_public}:${key.message_number}`)
    .sort();
}

function snapshot(state: SerializedState): SerializedState {
  return JSON.parse(JSON.stringify(state)) as SerializedState;
}

describe("merging never brings back a message key this device used", () => {
  it("drops a key from an earlier chain this device moved past when the other copy wins", () => {
    const local = make_state({
      epoch: 1,
      updated_at: 5_000,
      received_chains: [{ dh_public: "dh-a", next: 5 }],
    });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-epoch-2",
      skipped_message_keys: [skipped("dh-a", 1), skipped("dh-b", 1)],
      epoch: 2,
      updated_at: 9_000,
    });

    const merged = merge_ratchet_states(local, remote);

    expect(merged.state.root_key).toBe("root-key-epoch-2");
    expect(key_ids(merged)).toEqual(["dh-b:1"]);
  });

  it("drops a key on the current chain when the other copy wins", () => {
    const local = make_state({
      recv_message_number: 4,
      epoch: 1,
      updated_at: 5_000,
    });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-epoch-2",
      skipped_message_keys: [skipped("remote-dh-pub", 2)],
      epoch: 2,
      updated_at: 9_000,
    });

    expect(key_ids(merge_ratchet_states(local, remote))).toEqual([]);
  });

  it("drops a key from an earlier chain while this device has no receive chain", () => {
    const local = make_state({
      chain_key_recv: null,
      received_chains: [{ dh_public: "dh-a", next: 3 }],
    });
    const remote = make_state({
      skipped_message_keys: [skipped("dh-a", 2), skipped("dh-a", 3)],
    });

    expect(key_ids(merge_ratchet_states(local, remote))).toEqual(["dh-a:3"]);
  });

  it("keeps a key from an earlier chain that this device still holds", () => {
    const local = make_state({
      epoch: 1,
      skipped_message_keys: [skipped("dh-a", 1)],
      received_chains: [{ dh_public: "dh-a", next: 5 }],
    });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-epoch-2",
      skipped_message_keys: [skipped("dh-a", 1), skipped("dh-a", 2)],
      epoch: 2,
    });

    expect(key_ids(merge_ratchet_states(local, remote))).toEqual(["dh-a:1"]);
  });

  it("still imports keys on a chain this device never received", () => {
    const local = make_state({
      received_chains: [{ dh_public: "dh-a", next: 5 }],
      epoch: 1,
    });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-epoch-2",
      skipped_message_keys: [skipped("dh-c", 0), skipped("dh-a", 5)],
      epoch: 2,
    });

    expect(key_ids(merge_ratchet_states(local, remote))).toEqual([
      "dh-a:5",
      "dh-c:0",
    ]);
  });

  it("keeps this device's record and adds the chain it was on when the other copy wins", () => {
    const local = make_state({
      recv_message_number: 7,
      epoch: 1,
      received_chains: [{ dh_public: "dh-a", next: 5 }],
    });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      dh_remote_public: "dh-z",
      root_key: "root-key-epoch-2",
      epoch: 2,
      received_chains: [{ dh_public: "dh-y", next: 9 }],
    });

    const merged = merge_ratchet_states(local, remote);

    expect(merged.state.dh_remote_public).toBe("dh-z");
    expect(merged.state.received_chains).toEqual([
      { dh_public: "dh-a", next: 5 },
      { dh_public: "remote-dh-pub", next: 7 },
    ]);
  });

  it("does not let the other copy's record refuse keys this device never had", () => {
    const local = make_state({ chain_key_recv: null });
    const remote = make_state({
      skipped_message_keys: [skipped("dh-y", 1)],
      received_chains: [{ dh_public: "dh-y", next: 9 }],
    });

    const merged = merge_ratchet_states(local, remote);

    expect(key_ids(merged)).toEqual(["dh-y:1"]);
    expect(merged.state.received_chains).toEqual([]);
  });
});

describe("the received chain record", () => {
  it("keeps the highest position for a chain", () => {
    expect(
      record_received_chain(
        [
          { dh_public: "dh-a", next: 8 },
          { dh_public: "dh-b", next: 2 },
        ],
        "dh-a",
        3,
      ),
    ).toEqual([
      { dh_public: "dh-b", next: 2 },
      { dh_public: "dh-a", next: 8 },
    ]);
  });

  it("is bounded and forgets the oldest chain first", () => {
    let chains = record_received_chain(undefined, "dh-0", 1);

    for (let index = 1; index <= MAX_RECEIVED_CHAINS; index++) {
      chains = record_received_chain(chains, `dh-${index}`, 1);
    }

    expect(chains).toHaveLength(MAX_RECEIVED_CHAINS);
    expect(chains[0].dh_public).toBe("dh-1");
  });

  it("refuses a stored state whose record is malformed", () => {
    const state = make_state({
      received_chains: [{ dh_public: "dh-a", next: -1 }],
    });

    expect(DoubleRatchet.try_deserialize(state)).toBeNull();
  });

  it("refuses a stored state whose record is too long", () => {
    const state = make_state({
      received_chains: Array.from(
        { length: MAX_RECEIVED_CHAINS + 1 },
        (_, index) => ({ dh_public: `dh-${index}`, next: 1 }),
      ),
    });

    expect(DoubleRatchet.try_deserialize(state)).toBeNull();
  });
});

describe("a real session merged with an older copy of itself", () => {
  async function session() {
    const shared_secret = crypto.getRandomValues(new Uint8Array(32));
    const receiver_keypair = await generate_keypair();
    const alice = await DoubleRatchet.init_sender(
      shared_secret,
      receiver_keypair.public_key,
      CONVERSATION,
    );
    const bob = await DoubleRatchet.init_receiver(
      shared_secret,
      receiver_keypair,
      CONVERSATION,
    );

    return { alice, bob };
  }

  it("a key read before the chain moved on stays gone after merging the older copy", async () => {
    const { alice, bob } = await session();
    const first = await alice.encrypt("zero");
    const second = await alice.encrypt("one");
    const third = await alice.encrypt("two");

    expect(await bob.decrypt(third)).toBe("two");

    const older_copy = snapshot(await bob.serialize());

    expect(older_copy.state.skipped_message_keys).toHaveLength(2);
    expect(await bob.decrypt(first)).toBe("zero");

    expect(await alice.decrypt(await bob.encrypt("reply"))).toBe("reply");
    expect(await bob.decrypt(await alice.encrypt("next chain"))).toBe(
      "next chain",
    );

    const current = snapshot(await bob.serialize());

    expect(current.state.received_chains).toEqual([
      { dh_public: first.header.dh_public, next: 3 },
    ]);

    const merged = merge_ratchet_states(current, older_copy);

    expect(key_ids(merged)).toEqual([`${first.header.dh_public}:1`]);

    const restored = DoubleRatchet.deserialize(snapshot(merged));

    expect(await restored.decrypt(second)).toBe("one");
    await expect(restored.decrypt(first)).rejects.toThrow();
  });

  it("the record survives a save and load", async () => {
    const { alice, bob } = await session();

    expect(await bob.decrypt(await alice.encrypt("hello"))).toBe("hello");
    expect(await alice.decrypt(await bob.encrypt("reply"))).toBe("reply");
    expect(await bob.decrypt(await alice.encrypt("again"))).toBe("again");

    const saved = snapshot(await bob.serialize());
    const loaded = DoubleRatchet.deserialize(snapshot(saved));

    expect(saved.state.received_chains).toHaveLength(1);
    expect((await loaded.serialize()).state.received_chains).toEqual(
      saved.state.received_chains,
    );
  });
});
