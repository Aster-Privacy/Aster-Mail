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
import { GUARD_ALPHABET } from "./guard_code";

export const RESCUE_CODE_LENGTH = 25;
export const RESCUE_GROUP_SIZE = 5;

export function generate_rescue_code(): string {
  const n = GUARD_ALPHABET.length;
  const limit = 256 - (256 % n);
  const buf = new Uint8Array(64);
  let out = "";

  while (out.length < RESCUE_CODE_LENGTH) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte < limit && out.length < RESCUE_CODE_LENGTH) {
        out += GUARD_ALPHABET[byte % n];
      }
    }
  }
  buf.fill(0);

  return out;
}

export function normalize_rescue_code(input: string): string | null {
  const value = input.toUpperCase().replace(/[\s-]/g, "");

  if (value.length !== RESCUE_CODE_LENGTH) return null;
  for (const ch of value) {
    if (!GUARD_ALPHABET.includes(ch)) return null;
  }

  return value;
}

export function format_rescue_code(code: string): string {
  const groups: string[] = [];

  for (let i = 0; i < code.length; i += RESCUE_GROUP_SIZE) {
    groups.push(code.slice(i, i + RESCUE_GROUP_SIZE));
  }

  return groups.join("-");
}
