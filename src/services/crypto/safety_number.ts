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
export const SAFETY_NUMBER_VERSION = 2;
export const SAFETY_NUMBER_ITERATIONS = 5200;
export const SAFETY_NUMBER_GROUPS = 12;

const DOMAIN_LABEL = "aster-safety-number";
const MIN_FINGERPRINT_BYTES = 20;
const MAX_FINGERPRINT_BYTES = 64;
const HALF_BYTES = 30;
const CHUNK_BYTES = 5;
const CHUNK_MODULUS = 100000n;

export class SafetyNumberInputError extends Error {
  constructor() {
    super("safety_number_input");
    this.name = "SafetyNumberInputError";
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export function encode_party(fingerprint: Uint8Array): Uint8Array {
  if (
    fingerprint.length < MIN_FINGERPRINT_BYTES ||
    fingerprint.length > MAX_FINGERPRINT_BYTES
  ) {
    throw new SafetyNumberInputError();
  }

  return concat([
    new TextEncoder().encode(DOMAIN_LABEL),
    new Uint8Array([0, SAFETY_NUMBER_VERSION, fingerprint.length]),
    fingerprint,
  ]);
}

async function sha512(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-512", data as BufferSource);

  return new Uint8Array(digest);
}

async function party_digits(fingerprint: Uint8Array): Promise<string> {
  const encoded = encode_party(fingerprint);
  let hash = await sha512(encoded);

  for (let round = 1; round < SAFETY_NUMBER_ITERATIONS; round++) {
    hash = await sha512(concat([hash, encoded]));
  }

  let digits = "";

  for (let offset = 0; offset < HALF_BYTES; offset += CHUNK_BYTES) {
    let chunk = 0n;

    for (let index = 0; index < CHUNK_BYTES; index++) {
      chunk = (chunk << 8n) | BigInt(hash[offset + index]);
    }

    digits += (chunk % CHUNK_MODULUS).toString().padStart(5, "0");
  }

  return digits;
}

export async function compute_safety_number(
  local_fingerprint: Uint8Array,
  remote_fingerprint: Uint8Array,
): Promise<string[]> {
  const [local_digits, remote_digits] = await Promise.all([
    party_digits(local_fingerprint),
    party_digits(remote_fingerprint),
  ]);
  const joined =
    local_digits <= remote_digits
      ? local_digits + remote_digits
      : remote_digits + local_digits;
  const groups: string[] = [];

  for (let index = 0; index < SAFETY_NUMBER_GROUPS; index++) {
    groups.push(joined.slice(index * 5, index * 5 + 5));
  }

  return groups;
}

export function hex_fingerprint_bytes(hex: string | null): Uint8Array | null {
  if (!hex) return null;

  const clean = hex.replace(/\s+/g, "").toLowerCase();

  if (clean.length === 0 || clean.length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/.test(clean)) return null;

  const out = new Uint8Array(clean.length / 2);

  for (let index = 0; index < out.length; index++) {
    out[index] = parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }

  return out;
}
