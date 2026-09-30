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

import { describe, it, expect } from "vitest";

import {
  merge_discards_local_epoch,
  merge_ratchet_states,
} from "./ratchet_state_merge";

const CONVERSATION = "conversation-token-abc";

function skipped(
  dh_public: string,
  message_number: number,
  timestamp: number,
): SkippedMessageKey {
  return {
    dh_public,
    message_number,
    message_key: `key-${dh_public}-${message_number}`,
    timestamp,
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

describe("ratchet state merge", () => {
  it("keeps the furthest send chain so a message key is never reused", () => {
    const local = make_state({
      chain_key_send: "send-chain-5",
      send_message_number: 5,
    });
    const remote = make_state({
      chain_key_send: "send-chain-2",
      send_message_number: 2,
    });

    expect(merge_ratchet_states(local, remote).state).toMatchObject({
      chain_key_send: "send-chain-5",
      send_message_number: 5,
    });

    expect(merge_ratchet_states(remote, local).state).toMatchObject({
      chain_key_send: "send-chain-5",
      send_message_number: 5,
    });
  });

  it("keeps the earliest receive chain so nothing becomes undecryptable", () => {
    const local = make_state({
      chain_key_recv: "recv-chain-7",
      recv_message_number: 7,
    });
    const remote = make_state({
      chain_key_recv: "recv-chain-3",
      recv_message_number: 3,
    });

    expect(merge_ratchet_states(local, remote).state).toMatchObject({
      chain_key_recv: "recv-chain-3",
      recv_message_number: 3,
    });

    expect(merge_ratchet_states(remote, local).state).toMatchObject({
      chain_key_recv: "recv-chain-3",
      recv_message_number: 3,
    });
  });

  it("adopts a receive chain the other device established first", () => {
    const local = make_state({ chain_key_recv: null, recv_message_number: 0 });
    const remote = make_state({
      chain_key_recv: "recv-chain-4",
      recv_message_number: 4,
    });

    expect(merge_ratchet_states(local, remote).state).toMatchObject({
      chain_key_recv: "recv-chain-4",
      recv_message_number: 4,
    });
  });

  it("unions skipped message keys from both devices", () => {
    const local = make_state({
      skipped_message_keys: [skipped("dh-a", 1, 10), skipped("dh-a", 2, 20)],
    });
    const remote = make_state({
      skipped_message_keys: [skipped("dh-a", 2, 20), skipped("dh-b", 1, 30)],
    });

    const merged = merge_ratchet_states(local, remote);

    expect(
      merged.state.skipped_message_keys.map(
        (key) => `${key.dh_public}:${key.message_number}`,
      ),
    ).toEqual(["dh-a:1", "dh-a:2", "dh-b:1"]);
  });

  it("never drops a skipped key when only one side has it", () => {
    const local = make_state({
      skipped_message_keys: [skipped("dh-a", 9, 90)],
    });
    const remote = make_state({ skipped_message_keys: [] });

    expect(
      merge_ratchet_states(remote, local).state.skipped_message_keys,
    ).toHaveLength(1);
  });

  it("carries skipped keys across a diverged dh epoch", () => {
    const local = make_state({
      skipped_message_keys: [skipped("dh-a", 1, 10)],
      epoch: 1,
      updated_at: 5_000,
    });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-epoch-2",
      chain_key_send: "send-chain-epoch-2",
      skipped_message_keys: [skipped("dh-b", 1, 20)],
      epoch: 2,
      updated_at: 9_000,
    });

    const merged = merge_ratchet_states(local, remote);

    expect(merged.state.root_key).toBe("root-key-epoch-2");
    expect(merged.state.skipped_message_keys).toHaveLength(2);
    expect(merged.state.updated_at).toBe(9_000);
  });

  it("keeps the higher epoch even when the other side was written later", () => {
    const local = make_state({
      root_key: "root-key-epoch-3",
      epoch: 3,
      updated_at: 2_000,
    });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-epoch-2",
      epoch: 2,
      updated_at: 9_000,
    });

    expect(merge_ratchet_states(local, remote).state.root_key).toBe(
      "root-key-epoch-3",
    );
    expect(merge_ratchet_states(remote, local).state.root_key).toBe(
      "root-key-epoch-3",
    );
  });

  it("falls back to the newer write when both sides report the same epoch", () => {
    const local = make_state({ epoch: 4, updated_at: 2_000 });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-epoch-other",
      epoch: 4,
      updated_at: 9_000,
    });

    expect(merge_ratchet_states(local, remote).state.root_key).toBe(
      "root-key-epoch-other",
    );
  });

  it("resolves a full tie the same way on both devices", () => {
    const local = make_state({ epoch: 4, updated_at: 7_000 });
    const remote = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-zzz",
      epoch: 4,
      updated_at: 7_000,
    });

    expect(merge_ratchet_states(local, remote).state.root_key).toBe(
      merge_ratchet_states(remote, local).state.root_key,
    );
  });

  it("treats a state written before epochs existed as epoch zero", () => {
    const legacy = make_state({ epoch: undefined, updated_at: 9_000 });
    const current = make_state({
      dh_keypair: { public_key: "other-dh-pub", secret_key: "other-dh-sec" },
      root_key: "root-key-epoch-1",
      epoch: 1,
      updated_at: 2_000,
    });

    expect(merge_ratchet_states(legacy, current).state.root_key).toBe(
      "root-key-epoch-1",
    );
  });

  it("keeps the highest epoch when both devices are on the same chain", () => {
    const local = make_state({ epoch: 2 });
    const remote = make_state({ epoch: 5 });

    expect(merge_ratchet_states(local, remote).state.epoch).toBe(5);
  });

  it("keeps a bootstrap known to only one device", () => {
    const local = make_state();
    const remote = make_state({
      bootstrap: { ephemeral_key: "eph-key" },
    });

    expect(merge_ratchet_states(local, remote).state.bootstrap).toEqual({
      ephemeral_key: "eph-key",
    });
  });

  it("marks the merged state as needing another push", () => {
    const merged = merge_ratchet_states(make_state(), make_state());

    expect(merged.state.dirty_since_sync).toBe(true);
  });

  it("refuses to merge states from different conversations", () => {
    const other = make_state();

    other.conversation_id = "a-different-conversation";

    expect(() => merge_ratchet_states(make_state(), other)).toThrow();
  });
});

describe("detecting a merge that discards the local epoch", () => {
  it("reports a discard when the remote epoch wins and drops the local receiving chain", () => {
    const local = make_state({
      root_key: "root-key-epoch-1",
      chain_key_recv: "local-recv-chain",
      epoch: 1,
    });
    const remote = make_state({
      root_key: "root-key-epoch-2",
      dh_remote_public: "remote-dh-pub-rotated",
      chain_key_recv: "remote-recv-chain",
      epoch: 2,
    });

    expect(merge_discards_local_epoch(local, remote)).toBe(true);
    expect(merge_ratchet_states(local, remote).state.chain_key_recv).toBe(
      "remote-recv-chain",
    );
  });

  it("reports no discard when the local epoch wins", () => {
    const local = make_state({ root_key: "root-key-epoch-3", epoch: 3 });
    const remote = make_state({ root_key: "root-key-epoch-2", epoch: 2 });

    expect(merge_discards_local_epoch(local, remote)).toBe(false);
  });

  it("reports no discard when both sides are on the same epoch", () => {
    const local = make_state({ send_message_number: 4 });
    const remote = make_state({ send_message_number: 1 });

    expect(merge_discards_local_epoch(local, remote)).toBe(false);
  });

  it("reports no discard for a mismatched conversation", () => {
    const local = make_state({ epoch: 1 });
    const remote = {
      ...make_state({ root_key: "other", epoch: 9 }),
      conversation_id: "different-conversation",
    };

    expect(merge_discards_local_epoch(local, remote)).toBe(false);
  });
});

describe("retaining skipped message keys across devices", () => {
  it("keeps the same number of keys a mobile device can hold", () => {
    const local = make_state({
      skipped_message_keys: Array.from({ length: 1500 }, (_, index) =>
        skipped("local-dh-pub", index, 1_000 + index),
      ),
    });
    const remote = make_state({
      skipped_message_keys: Array.from({ length: 1500 }, (_, index) =>
        skipped("remote-dh-pub", index, 10_000 + index),
      ),
    });

    const merged = merge_ratchet_states(local, remote);

    expect(merged.state.skipped_message_keys).toHaveLength(2000);
  });

  it("drops the oldest keys first when the merged set overflows", () => {
    const local = make_state({
      skipped_message_keys: Array.from({ length: 1500 }, (_, index) =>
        skipped("local-dh-pub", index, 1_000 + index),
      ),
    });
    const remote = make_state({
      skipped_message_keys: Array.from({ length: 1500 }, (_, index) =>
        skipped("remote-dh-pub", index, 10_000 + index),
      ),
    });

    const merged = merge_ratchet_states(local, remote);
    const timestamps = merged.state.skipped_message_keys.map(
      (k) => k.timestamp,
    );

    expect(Math.min(...timestamps)).toBe(1_000 + 1000);
    expect(Math.max(...timestamps)).toBe(10_000 + 1499);
  });
});
