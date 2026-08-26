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
import type {
  RatchetState,
  SerializedState,
  SkippedMessageKey,
} from "./double_ratchet";

const MAX_MERGED_SKIPPED_KEYS = 2000;

function skipped_key_id(key: SkippedMessageKey): string {
  return `${key.dh_public}:${key.message_number}`;
}

export function merge_skipped_message_keys(
  a: SkippedMessageKey[],
  b: SkippedMessageKey[],
): SkippedMessageKey[] {
  return merge_skipped_keys(a, b);
}

function merge_skipped_keys(
  a: SkippedMessageKey[],
  b: SkippedMessageKey[],
): SkippedMessageKey[] {
  const by_id = new Map<string, SkippedMessageKey>();

  for (const key of [...a, ...b]) {
    const id = skipped_key_id(key);
    const existing = by_id.get(id);

    if (!existing || key.timestamp > existing.timestamp) {
      by_id.set(id, { ...key });
    }
  }

  const merged = [...by_id.values()].sort((x, y) => x.timestamp - y.timestamp);

  return merged.slice(Math.max(0, merged.length - MAX_MERGED_SKIPPED_KEYS));
}

function same_epoch(a: RatchetState, b: RatchetState): boolean {
  return (
    a.dh_keypair.public_key === b.dh_keypair.public_key &&
    a.dh_remote_public === b.dh_remote_public &&
    a.root_key === b.root_key
  );
}

function pick_newer_epoch(
  local: RatchetState,
  remote: RatchetState,
): RatchetState {
  const local_epoch = local.epoch ?? 0;
  const remote_epoch = remote.epoch ?? 0;

  if (local_epoch !== remote_epoch) {
    return local_epoch > remote_epoch ? local : remote;
  }

  if (local.updated_at !== remote.updated_at) {
    return local.updated_at > remote.updated_at ? local : remote;
  }

  return local.root_key > remote.root_key ? local : remote;
}

export function merge_discards_local_epoch(
  local: SerializedState,
  remote: SerializedState,
): boolean {
  if (local.conversation_id !== remote.conversation_id) return false;

  if (same_epoch(local.state, remote.state)) return false;

  return pick_newer_epoch(local.state, remote.state) !== local.state;
}

export function merge_ratchet_states(
  local: SerializedState,
  remote: SerializedState,
): SerializedState {
  if (local.conversation_id !== remote.conversation_id) {
    throw new Error("Ratchet state conversation mismatch");
  }

  const skipped_message_keys = merge_skipped_keys(
    local.state.skipped_message_keys ?? [],
    remote.state.skipped_message_keys ?? [],
  );

  if (!same_epoch(local.state, remote.state)) {
    const winner = pick_newer_epoch(local.state, remote.state);

    return {
      conversation_id: local.conversation_id,
      state: {
        ...winner,
        skipped_message_keys,
        dirty_since_sync: true,
        updated_at: Math.max(local.state.updated_at, remote.state.updated_at),
      },
    };
  }

  const send_ahead =
    local.state.send_message_number >= remote.state.send_message_number
      ? local.state
      : remote.state;

  const recv_behind =
    local.state.chain_key_recv === null
      ? remote.state
      : remote.state.chain_key_recv === null
        ? local.state
        : local.state.recv_message_number <= remote.state.recv_message_number
          ? local.state
          : remote.state;

  return {
    conversation_id: local.conversation_id,
    state: {
      ...local.state,
      chain_key_send: send_ahead.chain_key_send,
      send_message_number: send_ahead.send_message_number,
      chain_key_recv: recv_behind.chain_key_recv,
      recv_message_number: recv_behind.recv_message_number,
      previous_chain_length: Math.max(
        local.state.previous_chain_length,
        remote.state.previous_chain_length,
      ),
      epoch: Math.max(local.state.epoch ?? 0, remote.state.epoch ?? 0),
      bootstrap: local.state.bootstrap ?? remote.state.bootstrap,
      skipped_message_keys,
      dirty_since_sync: true,
      updated_at: Math.max(local.state.updated_at, remote.state.updated_at),
    },
  };
}
