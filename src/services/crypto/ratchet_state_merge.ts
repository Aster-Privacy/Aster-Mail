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

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

import {
  record_received_chain,
  type ReceivedChain,
} from "./ratchet_received_chains";

const MAX_MERGED_SKIPPED_KEYS = 2000;
const MAX_RETIRED_SEND_CATCH_UP = 1000;

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

export function local_received_chains(state: RatchetState): ReceivedChain[] {
  const chains = state.received_chains ?? [];

  if (state.chain_key_recv === null || state.dh_remote_public === null) {
    return chains.map((chain) => ({ ...chain }));
  }

  return record_received_chain(
    chains,
    state.dh_remote_public,
    state.recv_message_number,
  );
}

function receive_floors(state: RatchetState): Map<string, number> {
  const floors = new Map<string, number>();

  for (const chain of local_received_chains(state)) {
    floors.set(
      chain.dh_public,
      Math.max(floors.get(chain.dh_public) ?? 0, chain.next),
    );
  }

  return floors;
}

function remote_keys_still_pending(
  local: RatchetState,
  remote: RatchetState,
): SkippedMessageKey[] {
  const remote_keys = remote.skipped_message_keys ?? [];
  const floors = receive_floors(local);
  const local_ids = new Set(
    (local.skipped_message_keys ?? []).map(skipped_key_id),
  );

  return remote_keys.filter(
    (key) =>
      key.message_number >= (floors.get(key.dh_public) ?? 0) ||
      local_ids.has(skipped_key_id(key)),
  );
}

function same_epoch(a: RatchetState, b: RatchetState): boolean {
  return (
    a.dh_keypair.public_key === b.dh_keypair.public_key &&
    a.dh_remote_public === b.dh_remote_public &&
    a.root_key === b.root_key
  );
}

export function shares_ratchet_epoch(
  a: RatchetState,
  b: RatchetState,
): boolean {
  return same_epoch(a, b);
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

  return root_key_digest(local) > root_key_digest(remote) ? local : remote;
}

function root_key_digest(state: RatchetState): string {
  return bytesToHex(sha256(new TextEncoder().encode(state.root_key ?? "")));
}

function created_at_or_zero(state: RatchetState): number {
  const value = state.created_at;

  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function pick_winner(
  local: RatchetState,
  remote: RatchetState,
  remote_versioned: boolean,
): RatchetState {
  if (remote_versioned) return pick_newer_epoch(local, remote);

  if (created_at_or_zero(remote) < created_at_or_zero(local)) {
    return local;
  }

  const local_epoch = local.epoch ?? 0;
  const remote_epoch = remote.epoch ?? 0;

  if (remote_epoch !== local_epoch) {
    return remote_epoch > local_epoch ? remote : local;
  }

  return remote.updated_at > local.updated_at ? remote : local;
}

export function archived_session_supersedes(
  archived: SerializedState,
  loaded: SerializedState | null,
): boolean {
  if (!loaded) return true;

  return created_at_or_zero(archived.state) > created_at_or_zero(loaded.state);
}

export function server_replacement_supersedes(
  server: SerializedState,
  loaded: SerializedState | null,
): boolean {
  if (!loaded) return true;

  if (server.conversation_id !== loaded.conversation_id) return false;

  if (same_epoch(server.state, loaded.state)) return false;

  return pick_newer_epoch(loaded.state, server.state) === server.state;
}

export function merge_discards_local_epoch(
  local: SerializedState,
  remote: SerializedState,
  remote_versioned = true,
): boolean {
  if (local.conversation_id !== remote.conversation_id) return false;

  if (same_epoch(local.state, remote.state)) return false;

  return (
    pick_winner(local.state, remote.state, remote_versioned) !== local.state
  );
}

function carried_session_binding(
  winner: RatchetState,
  local: RatchetState,
  remote: RatchetState,
): string | undefined {
  if (winner.session_binding) return winner.session_binding;

  const created = created_at_or_zero(winner);

  if (created === 0) return undefined;

  for (const other of [local, remote]) {
    if (
      other !== winner &&
      other.session_binding &&
      created_at_or_zero(other) === created
    ) {
      return other.session_binding;
    }
  }

  return undefined;
}

export function merge_ratchet_states(
  local: SerializedState,
  remote: SerializedState,
  remote_versioned = true,
): SerializedState {
  if (local.conversation_id !== remote.conversation_id) {
    throw new Error("Ratchet state conversation mismatch");
  }

  const local_skipped = local.state.skipped_message_keys ?? [];
  const merged_skipped = merge_skipped_keys(
    local_skipped,
    remote_keys_still_pending(local.state, remote.state),
  );

  if (!same_epoch(local.state, remote.state)) {
    const winner = pick_winner(local.state, remote.state, remote_versioned);
    const keep_local_skipped = !remote_versioned && winner === local.state;
    const header_bound =
      local.state.header_bound || remote.state.header_bound || undefined;

    return {
      conversation_id: local.conversation_id,
      state: {
        ...winner,
        remote_identity_key:
          winner.remote_identity_key ||
          local.state.remote_identity_key ||
          remote.state.remote_identity_key,
        header_bound,
        session_binding: carried_session_binding(
          winner,
          local.state,
          remote.state,
        ),
        skipped_message_keys: keep_local_skipped
          ? merge_skipped_keys(local_skipped, [])
          : merged_skipped,
        received_chains: local_received_chains(local.state),
        dirty_since_sync: true,
        updated_at: Math.max(local.state.updated_at, remote.state.updated_at),
      },
    };
  }

  const send_ahead =
    local.state.send_message_number >= remote.state.send_message_number
      ? local.state
      : remote.state;

  const recv_source =
    local.state.chain_key_recv === null ? remote.state : local.state;
  const skipped_message_keys =
    local.state.chain_key_recv === null
      ? merged_skipped
      : merge_skipped_keys(local_skipped, []);

  return {
    conversation_id: local.conversation_id,
    state: {
      ...local.state,
      chain_key_send: send_ahead.chain_key_send,
      send_message_number: send_ahead.send_message_number,
      chain_key_recv: recv_source.chain_key_recv,
      recv_message_number: recv_source.recv_message_number,
      previous_chain_length: Math.max(
        local.state.previous_chain_length,
        remote.state.previous_chain_length,
      ),
      epoch: Math.max(local.state.epoch ?? 0, remote.state.epoch ?? 0),
      bootstrap: local.state.bootstrap ?? remote.state.bootstrap,
      remote_identity_key:
        local.state.remote_identity_key || remote.state.remote_identity_key,
      header_bound:
        local.state.header_bound || remote.state.header_bound || undefined,
      session_binding:
        local.state.session_binding || remote.state.session_binding,
      weak_bootstrap: local.state.weak_bootstrap || remote.state.weak_bootstrap,
      account_unbound:
        local.state.account_unbound || remote.state.account_unbound,
      skipped_message_keys,
      received_chains: local_received_chains(local.state),
      dirty_since_sync: true,
      updated_at: Math.max(local.state.updated_at, remote.state.updated_at),
    },
  };
}

export function merge_retired_ratchet_state(
  local: SerializedState,
  remote: SerializedState,
): SerializedState {
  if (local.conversation_id !== remote.conversation_id) {
    throw new Error("Ratchet state conversation mismatch");
  }

  return {
    conversation_id: local.conversation_id,
    state: {
      ...local.state,
      skipped_message_keys: merge_skipped_keys(
        local.state.skipped_message_keys ?? [],
        [],
      ),
      dirty_since_sync: true,
    },
  };
}

export function retired_send_target(
  local: SerializedState,
  remote: SerializedState,
): number {
  const current = local.state.send_message_number;

  if (
    local.conversation_id !== remote.conversation_id ||
    local.state.chain_key_send === null ||
    !same_epoch(local.state, remote.state)
  ) {
    return current;
  }

  const target = remote.state.send_message_number;

  return Number.isSafeInteger(target) &&
    target > current &&
    target - current <= MAX_RETIRED_SEND_CATCH_UP
    ? target
    : current;
}
