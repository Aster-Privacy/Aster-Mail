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
import { base64_to_array } from "./base64";

const RATCHET_HEADER_AD_PREFIX = new TextEncoder().encode(
  "astermail-ratchet-header-v2",
);
const RATCHET_HEADER_AD_BOUND_LABEL = new TextEncoder().encode(
  "aster/ratchet/header/v3",
);

export interface RatchetHeaderFields {
  dh_public: string;
  previous_chain_length: number;
  message_number: number;
  v?: number;
  sb?: string;
}

export function encode_u32(value: number): Uint8Array {
  const encoded = new Uint8Array(4);

  new DataView(encoded.buffer).setUint32(0, value >>> 0, false);

  return encoded;
}

function concat_bytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export function encode_fields(fields: (Uint8Array | null)[]): Uint8Array {
  return concat_bytes(
    fields.flatMap((field, index) => [
      Uint8Array.of(index + 1),
      encode_u32(field?.length ?? 0),
      field ?? new Uint8Array(0),
    ]),
  );
}

export function encode_ratchet_header_ad(
  header: RatchetHeaderFields,
): Uint8Array | null {
  const version = header.v ?? 1;
  const fields = [
    base64_to_array(header.dh_public),
    encode_u32(header.previous_chain_length),
    encode_u32(header.message_number),
  ];

  if (version < 2) return null;

  if (version < 3) {
    return concat_bytes([
      RATCHET_HEADER_AD_PREFIX,
      Uint8Array.of(version),
      ...fields,
    ]);
  }

  if (!header.sb) throw new Error("Malformed ratchet header");

  return encode_fields([
    RATCHET_HEADER_AD_BOUND_LABEL,
    Uint8Array.of(version),
    base64_to_array(header.sb),
    ...fields,
  ]);
}
