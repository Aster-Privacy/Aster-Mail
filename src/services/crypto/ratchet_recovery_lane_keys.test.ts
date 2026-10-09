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
import type { PrekeyBundle } from "./x3dh";
import type { BootstrapData } from "./double_ratchet";

import { describe, it, expect } from "vitest";

import { resolve_recovery_lane_keys } from "./ratchet_encrypt";

const bundle = (pq: string): PrekeyBundle =>
  ({
    kem_identity_key: "identity-a",
    signed_prekey: "spk",
    signed_prekey_signature: "sig",
    pq_kem_public_key: pq,
  }) as unknown as PrekeyBundle;

const bootstrap = (identity: string, pq?: string): BootstrapData =>
  ({
    ephemeral_key: "eph",
    sender_identity_key: "me",
    recipient_identity_key: identity,
    recipient_pq_identity_key: pq,
  }) as unknown as BootstrapData;

describe("recovery lane recipient keys", () => {
  it("keeps the post-quantum key pinned at bootstrap over a refetched bundle", () => {
    expect(
      resolve_recovery_lane_keys(
        bundle("swapped-pq"),
        bootstrap("identity-a", "pinned-pq"),
      ),
    ).toEqual({
      identity_public: "identity-a",
      pq_identity_public: "pinned-pq",
    });
  });

  it("uses the bundle key when the identity changed", () => {
    expect(
      resolve_recovery_lane_keys(
        bundle("new-pq"),
        bootstrap("identity-old", "old-pq"),
      ),
    ).toEqual({ identity_public: "identity-a", pq_identity_public: "new-pq" });
  });

  it("uses the bundle key when nothing was pinned", () => {
    expect(
      resolve_recovery_lane_keys(bundle("bundle-pq"), bootstrap("identity-a")),
    ).toEqual({
      identity_public: "identity-a",
      pq_identity_public: "bundle-pq",
    });
  });
});
