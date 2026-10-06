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

import { base64url_encode } from "./device_envelope";
import {
  device_key_fingerprint,
  fingerprint_of_encoded_device_keys,
} from "./device_fingerprint";

const ED = new Uint8Array(32).fill(1);
const MLKEM = new Uint8Array(1184).fill(2);
const X = new Uint8Array(32).fill(3);
const VECTOR = "9B16 AF79 0A6A E2F2 55D3";

describe("device_key_fingerprint", () => {
  it("matches the published vector", () => {
    expect(device_key_fingerprint(ED, MLKEM, X)).toBe(VECTOR);
  });

  it("changes with any public key", () => {
    const other_32 = new Uint8Array(32).fill(9);
    const other_mlkem = new Uint8Array(1184).fill(9);

    expect(device_key_fingerprint(other_32, MLKEM, X)).not.toBe(VECTOR);
    expect(device_key_fingerprint(ED, other_mlkem, X)).not.toBe(VECTOR);
    expect(device_key_fingerprint(ED, MLKEM, other_32)).not.toBe(VECTOR);
  });

  it("does not let bytes move between neighboring keys", () => {
    expect(
      device_key_fingerprint(
        ED,
        new Uint8Array(1183).fill(2),
        new Uint8Array(33).fill(3),
      ),
    ).not.toBe(
      device_key_fingerprint(
        ED,
        new Uint8Array(1184).fill(2),
        new Uint8Array(32).fill(3),
      ),
    );
  });
});

describe("fingerprint_of_encoded_device_keys", () => {
  it("matches the published vector for the keys the server returns", () => {
    expect(
      fingerprint_of_encoded_device_keys({
        ed25519_pk: base64url_encode(ED),
        mlkem_pk: base64url_encode(MLKEM),
        x25519_pk: base64url_encode(X),
      }),
    ).toBe(VECTOR);
  });

  it("gives no fingerprint for keys of the wrong size or encoding", () => {
    expect(
      fingerprint_of_encoded_device_keys({
        ed25519_pk: base64url_encode(ED),
        mlkem_pk: base64url_encode(MLKEM.subarray(1)),
        x25519_pk: base64url_encode(X),
      }),
    ).toBeNull();
    expect(
      fingerprint_of_encoded_device_keys({
        ed25519_pk: "***",
        mlkem_pk: base64url_encode(MLKEM),
        x25519_pk: base64url_encode(X),
      }),
    ).toBeNull();
  });
});
