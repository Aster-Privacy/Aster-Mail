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
import { p256 } from "@noble/curves/nist";

import { array_to_base64 } from "./base64";

const P256_SCALAR_LEN = 32;

function base64url_decode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64url_encode(bytes: Uint8Array): string {
  return array_to_base64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function public_point_from_d(d: string): Uint8Array | null {
  let scalar: Uint8Array | null = null;

  try {
    scalar = base64url_decode(d);

    if (scalar.length !== P256_SCALAR_LEN) return null;

    return p256.getPublicKey(scalar, false);
  } catch {
    return null;
  } finally {
    scalar?.fill(0);
  }
}

export function complete_p256_private_jwk(jwk: JsonWebKey): JsonWebKey {
  if (!jwk.d || (jwk.x && jwk.y)) return jwk;
  if (jwk.crv && jwk.crv !== "P-256") return jwk;

  const point = public_point_from_d(jwk.d);

  if (!point) return jwk;

  return {
    ...jwk,
    kty: jwk.kty ?? "EC",
    crv: jwk.crv ?? "P-256",
    x: base64url_encode(point.slice(1, 33)),
    y: base64url_encode(point.slice(33, 65)),
  };
}

export function is_compact_p256_private_jwk(jwk_text?: string | null): boolean {
  if (!jwk_text) return false;

  try {
    const jwk: JsonWebKey = JSON.parse(jwk_text);

    return !!jwk.d && !jwk.x && !jwk.y;
  } catch {
    return false;
  }
}
