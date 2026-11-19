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
const SYNC_AAD_LABEL = "aster-ratchet-state-v3";
const RATCHET_STATE_MAGIC = new Uint8Array([0x41, 0x52, 0x53, 0x03]);
const RATCHET_STATE_HEADER_LENGTH = RATCHET_STATE_MAGIC.length + 16;

export type RatchetStateRefusal =
  "malformed" | "wrong_conversation" | "rolled_back" | "unbound";

export type RatchetStateContainerResult =
  | { kind: "accepted"; state: SerializedState; sync_version: number | null }
  | { kind: RatchetStateRefusal };

export function ratchet_state_bound_aad(conversation_id: string): Uint8Array {
  return new TextEncoder().encode(`${BOUND_AAD_PREFIX}${conversation_id}`);
}

export interface RatchetStateHeader {
  epoch: number;
  sync_version: number;
}

export interface RatchetStatePayload {
  header: RatchetStateHeader;
  header_bytes: Uint8Array;
  ciphertext: Uint8Array;
}

export function encode_ratchet_state_header(
  header: RatchetStateHeader,
): Uint8Array {
  if (
    !Number.isSafeInteger(header.epoch) ||
    header.epoch < 0 ||
    !Number.isSafeInteger(header.sync_version) ||
    header.sync_version < 0
  ) {
    throw new Error("Ratchet state header out of range");
  }

  const bytes = new Uint8Array(RATCHET_STATE_HEADER_LENGTH);
  const view = new DataView(bytes.buffer);

  bytes.set(RATCHET_STATE_MAGIC, 0);
  view.setBigUint64(RATCHET_STATE_MAGIC.length, BigInt(header.epoch));
  view.setBigUint64(
    RATCHET_STATE_MAGIC.length + 8,
    BigInt(header.sync_version),
  );

  return bytes;
}

export function split_ratchet_state_payload(
  bytes: Uint8Array,
): RatchetStatePayload | null {
  if (bytes.length <= RATCHET_STATE_HEADER_LENGTH) return null;

  for (let i = 0; i < RATCHET_STATE_MAGIC.length; i++) {
    if (bytes[i] !== RATCHET_STATE_MAGIC[i]) return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const epoch = view.getBigUint64(RATCHET_STATE_MAGIC.length);
  const sync_version = view.getBigUint64(RATCHET_STATE_MAGIC.length + 8);
  const max = BigInt(Number.MAX_SAFE_INTEGER);

  if (epoch > max || sync_version > max) return null;

  return {
    header: { epoch: Number(epoch), sync_version: Number(sync_version) },
    header_bytes: bytes.slice(0, RATCHET_STATE_HEADER_LENGTH),
    ciphertext: bytes.slice(RATCHET_STATE_HEADER_LENGTH),
  };
}

function length_prefixed(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  const out = new Uint8Array(4 + encoded.length);

  new DataView(out.buffer).setUint32(0, encoded.length);
  out.set(encoded, 4);

  return out;
}

export function ratchet_state_sync_aad(
  user_id: string,
  conversation_id: string,
  header_bytes: Uint8Array,
): Uint8Array {
  const parts = [
    new TextEncoder().encode(SYNC_AAD_LABEL),
    length_prefixed(user_id),
    length_prefixed(conversation_id),
    header_bytes,
  ];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export function header_matches_state(
  header: RatchetStateHeader,
  state: SerializedState,
  sync_version: number | null,
): boolean {
  return (
    sync_version === header.sync_version &&
    (state.state.epoch ?? 0) === header.epoch
  );
}

export function next_sync_version(floor: number): number {
  return Math.max(0, Number.isSafeInteger(floor) ? floor : 0) + 1;
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
  established = floor > 0,
  allow_unversioned = false,
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

  if (
    (established || floor > 0) &&
    (typeof bound_id !== "string" ||
      (sync_version === null && !allow_unversioned))
  ) {
    return { kind: "unbound" };
  }

  const inner_state = { ...state };

  delete inner_state.conversation_id;

  return {
    kind: "accepted",
    state: {
      state: inner_state as unknown as SerializedState["state"],
      conversation_id,
    },
    sync_version,
  };
}
