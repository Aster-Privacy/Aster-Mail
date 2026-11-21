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
import { hmac } from "@noble/hashes/hmac";
import { sha1 } from "@noble/hashes/sha1";

export const GUARD_ALPHABET = "23456789BCDFGHJKMNPQRTVWXY";
export const GUARD_CODE_LENGTH = 5;
export const GUARD_CODE_STEP_SECONDS = 30;

function step_bytes(step: number): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);

  view.setUint32(0, Math.floor(step / 0x100000000), false);
  view.setUint32(4, step >>> 0, false);

  return out;
}

export function guard_code_for_step(secret: Uint8Array, step: number): string {
  if (!Number.isInteger(step) || step < 0) throw new Error("invalid step");
  const digest = hmac(sha1, secret, step_bytes(step));
  const offset = digest[digest.length - 1] & 0x0f;
  let full =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) >>>
    0;
  let out = "";

  digest.fill(0);
  for (let i = 0; i < GUARD_CODE_LENGTH; i++) {
    out += GUARD_ALPHABET[full % GUARD_ALPHABET.length];
    full = Math.floor(full / GUARD_ALPHABET.length);
  }

  return out;
}

export function guard_step_at(unix_seconds: number): number {
  return Math.floor(unix_seconds / GUARD_CODE_STEP_SECONDS);
}

export function guard_code_at(secret: Uint8Array, unix_seconds: number): string {
  return guard_code_for_step(secret, guard_step_at(unix_seconds));
}

export function guard_code_seconds_left(unix_seconds: number): number {
  return (
    GUARD_CODE_STEP_SECONDS -
    (Math.floor(unix_seconds) % GUARD_CODE_STEP_SECONDS)
  );
}
