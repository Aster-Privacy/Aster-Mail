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
export interface RatchetPrekeyAccountKeys {
  signing_public_key: string;
  x3dh_max_version: number;
}

const CANONICAL_PARTS = { v1: 2, v2: 3, v3: 5 } as const;

export type SignedFormat = keyof typeof CANONICAL_PARTS;

export function signed_format_for(
  pq_identity_key?: string | null,
  account?: RatchetPrekeyAccountKeys | null,
): SignedFormat {
  return account ? "v3" : pq_identity_key ? "v2" : "v1";
}

export function build_ratchet_prekey_canonical(
  format: SignedFormat,
  kem_identity_key: string,
  signed_prekey: string,
  pq_identity_key?: string | null,
  account?: RatchetPrekeyAccountKeys | null,
): string {
  const parts = [
    kem_identity_key,
    signed_prekey,
    pq_identity_key ?? "",
    account?.signing_public_key ?? "",
    account?.x3dh_max_version ?? "",
  ].slice(0, CANONICAL_PARTS[format]);

  return `aster-ratchet-prekey-${format}:${parts.join(".")}`;
}

export function classify_signed_text(
  signed_text: string,
): SignedFormat | "unreadable" {
  const format = /^aster-ratchet-prekey-(v[123]):/.exec(signed_text)?.[1];

  return format ? (format as SignedFormat) : "unreadable";
}
