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
  bundle_is_downgraded,
  bundle_supports_pq,
  type PrekeyBundle,
} from "./x3dh";

const ML_KEM_768_EK_LEN = 1184;

function kem_key(): string {
  const bytes = new Uint8Array(ML_KEM_768_EK_LEN).fill(7);

  let binary = "";

  bytes.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

function base_bundle(overrides: Partial<PrekeyBundle> = {}): PrekeyBundle {
  return {
    kem_identity_key: "identity",
    signed_prekey: "signed",
    signed_prekey_signature: "signature",
    ...overrides,
  };
}

describe("post-quantum downgrade detection", () => {
  it("treats a peer that never published post-quantum material as classical", () => {
    const bundle = base_bundle({ pq_capable: false });

    expect(bundle_supports_pq(bundle)).toBe(false);
    expect(bundle_is_downgraded(bundle)).toBe(false);
  });

  it("treats a server that omits the capability flag as classical", () => {
    expect(bundle_is_downgraded(base_bundle())).toBe(false);
    expect(bundle_is_downgraded(base_bundle({ pq_capable: null }))).toBe(false);
  });

  it("flags a stripped bundle from a capable peer as a downgrade", () => {
    const bundle = base_bundle({
      pq_capable: true,
      pq_prekey: null,
      pq_kem_public_key: null,
    });

    expect(bundle_supports_pq(bundle)).toBe(false);
    expect(bundle_is_downgraded(bundle)).toBe(true);
  });

  it("does not flag a capable peer that still carries a one-time prekey", () => {
    const bundle = base_bundle({
      pq_capable: true,
      pq_prekey: { key_id: 4, public_key: kem_key() },
    });

    expect(bundle_supports_pq(bundle)).toBe(true);
    expect(bundle_is_downgraded(bundle)).toBe(false);
  });

  it("does not flag a capable peer that falls back to its kem identity key", () => {
    const bundle = base_bundle({
      pq_capable: true,
      pq_prekey: null,
      pq_kem_public_key: kem_key(),
    });

    expect(bundle_supports_pq(bundle)).toBe(true);
    expect(bundle_is_downgraded(bundle)).toBe(false);
  });

  it("flags a capable peer whose post-quantum keys are the wrong length", () => {
    const bundle = base_bundle({
      pq_capable: true,
      pq_prekey: { key_id: 4, public_key: btoa("short") },
      pq_kem_public_key: btoa("short"),
    });

    expect(bundle_supports_pq(bundle)).toBe(false);
    expect(bundle_is_downgraded(bundle)).toBe(true);
  });
});
