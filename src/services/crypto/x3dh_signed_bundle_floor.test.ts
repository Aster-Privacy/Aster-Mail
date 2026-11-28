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

import {
  negotiate_x3dh_version,
  signed_bundle_x3dh_floor,
  X3DH_VERSION_KEY_BOUND,
  X3DH_VERSION_LEGACY,
  X3DH_VERSION_TRANSCRIPT_BOUND,
  type PrekeyBundle,
} from "./x3dh";

const ML_KEM_768_EK_LEN = 1184;

function kem_key(): string {
  let binary = "";

  new Uint8Array(ML_KEM_768_EK_LEN)
    .fill(7)
    .forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

function bundle(overrides: Partial<PrekeyBundle> = {}): PrekeyBundle {
  return {
    kem_identity_key: "identity",
    signed_prekey: "signed",
    signed_prekey_signature: "signature",
    ...overrides,
  };
}

describe("handshake version floor from a signed bundle", () => {
  it("refuses a server-chosen legacy handshake when the owner signed the post-quantum key", () => {
    const signed = bundle({ pq_kem_public_key: kem_key(), x3dh_max_version: 1 });
    const floor = signed_bundle_x3dh_floor(signed, true, null);

    expect(floor).toBe(X3DH_VERSION_TRANSCRIPT_BOUND);
    expect(negotiate_x3dh_version(signed.x3dh_max_version, floor)).toBe(
      X3DH_VERSION_TRANSCRIPT_BOUND,
    );
  });

  it("keeps a higher remembered version", () => {
    const signed = bundle({ pq_kem_public_key: kem_key(), x3dh_max_version: 1 });

    expect(
      signed_bundle_x3dh_floor(signed, true, X3DH_VERSION_KEY_BOUND),
    ).toBe(X3DH_VERSION_KEY_BOUND);
  });

  it("leaves bundles without an owner-signed post-quantum key unchanged", () => {
    const unsigned = bundle({ pq_kem_public_key: kem_key(), x3dh_max_version: 1 });

    expect(signed_bundle_x3dh_floor(unsigned, false, null)).toBeNull();
    expect(signed_bundle_x3dh_floor(bundle(), true, null)).toBeNull();
    expect(
      negotiate_x3dh_version(1, signed_bundle_x3dh_floor(bundle(), true, null)),
    ).toBe(X3DH_VERSION_LEGACY);
  });
});
