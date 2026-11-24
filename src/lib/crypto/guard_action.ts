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
import { sha256 } from "@noble/hashes/sha256";

export const GUARD_ACTION = {
  enroll: 1,
  approve: 2,
  deny: 3,
  cancel: 4,
  skip: 5,
  veto: 6,
  panic: 7,
  remove_device: 8,
  switches: 9,
  join: 10,
  resume: 11,
  rotate_rescue: 12,
} as const;

export type GuardActionCode = (typeof GUARD_ACTION)[keyof typeof GUARD_ACTION];

export const GUARD_NUMBER_MIN = 10;
export const GUARD_NUMBER_MAX = 99;
export const ACTION_PK_LEN = 33;
export const PANIC_SUBJECT = new Uint8Array(32);

const encoder = new TextEncoder();
const ACTION_DOMAIN = encoder.encode("aster-guard-action-v1");
const KEYS_DOMAIN = encoder.encode("aster-guard-keys-v1");
const APPROVE_DOMAIN = encoder.encode("aster-guard-approve-v1");
const ID_DOMAIN = encoder.encode("aster-guard-id-v1");
const SWITCHES_DOMAIN = encoder.encode("aster-guard-switches-v1");
const NUMBER_DOMAIN = encoder.encode("aster-guard-number-v1");
const RESCUE_ROTATE_DOMAIN = encoder.encode("aster-guard-rescue-rotate-v1");
const UUID_PATTERN =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export function concat_bytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;

  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;

  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }

  return out;
}

export function uuid_bytes(value: string): Uint8Array {
  if (!UUID_PATTERN.test(value)) throw new Error("invalid uuid");
  const hex = value.replace(/-/g, "");
  const out = new Uint8Array(16);

  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return out;
}

function require_len(bytes: Uint8Array, len: number): void {
  if (bytes.length !== len) throw new Error("invalid length");
}

export function build_action_message(
  code: number,
  user_id: string,
  nonce: Uint8Array,
  subject: Uint8Array,
): Uint8Array {
  if (!Number.isInteger(code) || code < 1 || code > 255) {
    throw new Error("invalid action");
  }
  require_len(nonce, 32);
  require_len(subject, 32);

  return concat_bytes(
    ACTION_DOMAIN,
    Uint8Array.of(code),
    uuid_bytes(user_id),
    nonce,
    subject,
  );
}

export function keys_digest(
  ed25519_pk: Uint8Array,
  mlkem_pk: Uint8Array,
  x25519_pk: Uint8Array,
  action_pk: Uint8Array | null,
): Uint8Array {
  const action = action_pk ?? new Uint8Array(ACTION_PK_LEN);

  require_len(action, ACTION_PK_LEN);

  return sha256(concat_bytes(KEYS_DOMAIN, ed25519_pk, mlkem_pk, x25519_pk, action));
}

export function compress_p256(raw65: Uint8Array): Uint8Array {
  if (raw65.length !== 65 || raw65[0] !== 0x04) {
    throw new Error("invalid p256 point");
  }
  const out = new Uint8Array(ACTION_PK_LEN);

  out[0] = 0x02 | (raw65[64] & 1);
  out.set(raw65.subarray(1, 33), 1);

  return out;
}

export function approve_subject(
  request_id: string | null,
  digest: Uint8Array,
  number: number,
): Uint8Array {
  if (!Number.isInteger(number) || number < 0 || number > 255) {
    throw new Error("invalid number");
  }
  require_len(digest, 32);
  const rid = request_id ? uuid_bytes(request_id) : new Uint8Array(16);

  return sha256(concat_bytes(APPROVE_DOMAIN, rid, digest, Uint8Array.of(number)));
}

export function id_subject(id: string): Uint8Array {
  return sha256(concat_bytes(ID_DOMAIN, uuid_bytes(id)));
}

function u32_le(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error("invalid u32");
  }
  const out = new Uint8Array(4);

  new DataView(out.buffer).setUint32(0, value, true);

  return out;
}

export function switches_subject(switches: number, hold_scopes: number): Uint8Array {
  return sha256(concat_bytes(SWITCHES_DOMAIN, u32_le(switches), u32_le(hold_scopes)));
}

export function rescue_rotate_subject(normalized_code: string): Uint8Array {
  return sha256(concat_bytes(RESCUE_ROTATE_DOMAIN, encoder.encode(normalized_code)));
}

export function is_guard_number(number: number): boolean {
  return (
    Number.isInteger(number) &&
    number >= GUARD_NUMBER_MIN &&
    number <= GUARD_NUMBER_MAX
  );
}

export function number_hash(request_id: string, number: number): Uint8Array {
  if (!is_guard_number(number)) throw new Error("invalid number");

  return sha256(
    concat_bytes(NUMBER_DOMAIN, uuid_bytes(request_id), Uint8Array.of(number)),
  );
}

export function random_number(): number {
  const span = GUARD_NUMBER_MAX - GUARD_NUMBER_MIN + 1;
  const limit = 256 - (256 % span);
  const buf = new Uint8Array(1);

  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return GUARD_NUMBER_MIN + (buf[0] % span);
  }
}
