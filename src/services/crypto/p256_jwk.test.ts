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
import { describe, it, expect } from "vitest";

import {
  complete_p256_private_jwk,
  is_compact_p256_private_jwk,
} from "./p256_jwk";
import { import_ke_private_key } from "./key_manager_ke";

async function generate_full_jwk(): Promise<JsonWebKey> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  return crypto.subtle.exportKey("jwk", pair.privateKey);
}

function compact(jwk: JsonWebKey): JsonWebKey {
  return { kty: "EC", crv: "P-256", d: jwk.d };
}

describe("complete_p256_private_jwk", () => {
  it("restores the public coordinates of a compact key", async () => {
    const full = await generate_full_jwk();
    const completed = complete_p256_private_jwk(compact(full));

    expect(completed.x).toBe(full.x);
    expect(completed.y).toBe(full.y);
    expect(completed.d).toBe(full.d);
  });

  it("returns a full key unchanged", async () => {
    const full = await generate_full_jwk();

    expect(complete_p256_private_jwk(full)).toBe(full);
  });

  it("leaves a malformed scalar untouched", () => {
    const broken: JsonWebKey = { kty: "EC", crv: "P-256", d: "AAAA" };

    expect(complete_p256_private_jwk(broken)).toBe(broken);
  });

  it("lets WebCrypto import a compact key and derive the same secret", async () => {
    const full = await generate_full_jwk();
    const peer = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );

    await expect(
      crypto.subtle.importKey(
        "jwk",
        compact(full),
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveBits"],
      ),
    ).rejects.toThrow();

    const from_full = await import_ke_private_key(full);
    const from_compact = await import_ke_private_key(compact(full));
    const expected = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peer.publicKey },
      from_full,
      256,
    );
    const actual = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peer.publicKey },
      from_compact,
      256,
    );

    expect(new Uint8Array(actual)).toEqual(new Uint8Array(expected));
  });

  it("detects compact keys", async () => {
    const full = await generate_full_jwk();

    expect(is_compact_p256_private_jwk(JSON.stringify(compact(full)))).toBe(
      true,
    );
    expect(is_compact_p256_private_jwk(JSON.stringify(full))).toBe(false);
    expect(is_compact_p256_private_jwk(undefined)).toBe(false);
    expect(is_compact_p256_private_jwk("garbage")).toBe(false);
  });
});
