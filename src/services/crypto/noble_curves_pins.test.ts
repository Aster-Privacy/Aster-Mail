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
import { describe, expect, it } from "vitest";
import { p256 } from "@noble/curves/nist.js";
import { mapHashToField } from "@noble/curves/abstract/modular.js";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha256";

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const filled = (length: number, value: number): Uint8Array =>
  new Uint8Array(length).fill(value);

const seed = new Uint8Array(48).map((_, i) => (i * 7 + 3) & 255);
const digest = sha256(new TextEncoder().encode("aster pinned digest"));
const message = new TextEncoder().encode("aster pinned message");

const PINNED = {
  scalar: "a974972d28eb2192b1919211125931513ef0b02686f51b4a2eb54e4e2cf84e0d",
  pub_u:
    "0412d9508060c7106fc8a21afbd789ff5914b01adcc0befc062243c9c2ccce0044e8c88b0d56692ddb5c633e2fd08ab9cdd4ab65a06179409aa4b27ded33104c9e",
  pub_c: "0212d9508060c7106fc8a21afbd789ff5914b01adcc0befc062243c9c2ccce0044",
  sig: "0c508d078181825cd2dfbfa85e090a87ea899aeb4387bb0ef8136bfedab587571d8a1422063cc798a24c340474fb96cbca75cfb3da4ab830d8afede9f5394282",
  x_pub: "7d34a4815fa6b982535e60af3bd9b49556816080f1641ff81d2b7c8ae8268a44",
  x_shared: "c578ea72cc25e7c6c526bd1a7da4d91267d655f3f7aab0a751886d3ac7168661",
  ed_pub: "66cd608b928b88e50e0efeaa33faf1c43cefe07294b0b87e9fe0aba6a3cf7633",
  ed_sig:
    "f055afe332228ee87b5757968d87252a6508e8d4eea1237312bd02f9023dbeef67290b8753f27c55adb8726a8d47e11a44b40349742a042f3d00532c09db9109",
};

describe("curve outputs stay pinned", () => {
  it("maps a seed to the same P-256 scalar and public keys", () => {
    const scalar = mapHashToField(seed, p256.Point.Fn.ORDER);

    expect(hex(scalar)).toBe(PINNED.scalar);
    expect(hex(p256.getPublicKey(scalar, false))).toBe(PINNED.pub_u);
    expect(hex(p256.getPublicKey(scalar, true))).toBe(PINNED.pub_c);
  });

  it("signs a digest to the same compact P-256 signature", () => {
    const scalar = mapHashToField(seed, p256.Point.Fn.ORDER);
    const signature = p256.sign(digest, scalar, {
      lowS: true,
      prehash: false,
    });

    expect(hex(signature)).toBe(PINNED.sig);
    expect(
      p256.verify(signature, digest, p256.getPublicKey(scalar, false), {
        lowS: true,
        prehash: false,
      }),
    ).toBe(true);
  });

  it("derives the same X25519 public key and shared secret", () => {
    const secret = filled(32, 0x21);
    const peer = x25519.getPublicKey(filled(32, 0x42));

    expect(hex(x25519.getPublicKey(secret))).toBe(PINNED.x_pub);
    expect(hex(x25519.getSharedSecret(secret, peer))).toBe(PINNED.x_shared);
  });

  it("derives the same Ed25519 public key and signature", () => {
    const secret = filled(32, 0x13);

    expect(hex(ed25519.getPublicKey(secret))).toBe(PINNED.ed_pub);
    expect(hex(ed25519.sign(message, secret))).toBe(PINNED.ed_sig);
  });
});
