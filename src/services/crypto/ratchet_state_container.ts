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
import type { SerializedState } from "./double_ratchet";

const BOUND_AAD_PREFIX = "aster-ratchet-state-v2:";

export type RatchetStateRefusal =
  "malformed" | "wrong_conversation" | "rolled_back" | "unbound";

export type RatchetStateContainerResult =
  | { kind: "accepted"; state: SerializedState; sync_version: number | null }
  | { kind: RatchetStateRefusal };

export function ratchet_state_bound_aad(conversation_id: string): Uint8Array {
  return new TextEncoder().encode(`${BOUND_AAD_PREFIX}${conversation_id}`);
}

export function next_sync_version(floor: number, now_ms: number): number {
  return Math.max(now_ms, floor + 1);
}

export function encode_ratchet_state_container(
  state: SerializedState,
  sync_version: number,
): string {
  return JSON.stringify({
    state: { ...state.state, conversation_id: state.conversation_id },
    conversation_id: state.conversation_id,
    sync_version,
  });
}

function as_record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function decode_ratchet_state_container(
  plaintext_json: string,
  conversation_id: string,
  floor: number,
  opened_bound: boolean,
): RatchetStateContainerResult {
  let parsed: Record<string, unknown> | null;

  try {
    parsed = as_record(JSON.parse(plaintext_json));
  } catch {
    return { kind: "malformed" };
  }

  const state = parsed ? as_record(parsed.state) : null;

  if (!parsed || !state) return { kind: "malformed" };

  const inner_id = state.conversation_id;
  const bound_id = parsed.conversation_id;

  if (typeof inner_id === "string" && inner_id !== conversation_id) {
    return { kind: "wrong_conversation" };
  }

  if (typeof bound_id === "string" && bound_id !== conversation_id) {
    return { kind: "wrong_conversation" };
  }

  const raw_version = parsed.sync_version;
  const sync_version =
    typeof raw_version === "number" && Number.isSafeInteger(raw_version)
      ? raw_version
      : null;

  if (opened_bound && (typeof bound_id !== "string" || sync_version === null)) {
    return { kind: "unbound" };
  }

  if (sync_version !== null && sync_version < floor) {
    return { kind: "rolled_back" };
  }

  const { conversation_id: _bound_inner, ...inner_state } = state;

  return {
    kind: "accepted",
    state: {
      state: inner_state as unknown as SerializedState["state"],
      conversation_id,
    },
    sync_version,
  };
}
