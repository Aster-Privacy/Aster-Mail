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
  report_envelope_capability_if_due,
  resolve_reported_x3dh_version,
  ENVELOPE_CAPABILITY_X3DH_MAX_VERSION,
  ENVELOPE_CAPABILITY_X3DH_ONE_TIME_VERSION,
  type EnvelopeCapabilityDeps,
  type EnvelopeCapabilityResult,
} from "./envelope_capability";
import { X3DH_READ_VERSION_MAX, X3DH_VERSION_MAX } from "./x3dh";

function make_deps(
  one_time_prekeys_readable?: () => Promise<boolean>,
): { deps: EnvelopeCapabilityDeps; reported: number[] } {
  const store = new Map<string, string>();
  const reported: number[] = [];

  const deps: EnvelopeCapabilityDeps = {
    now: () => 1_000,
    new_client_id: () => "fixed-client-id",
    read: (key) => store.get(key) ?? null,
    write: (key, value) => {
      store.set(key, value);
    },
    post: async (
      _client_id,
      _max_envelope_marker,
      _platform,
      _identity_fingerprint,
      _pq_identity_fingerprint,
      x3dh_max_version,
    ) => {
      reported.push(x3dh_max_version);

      return {
        success: true,
        min_supported_marker: 4,
        pq_hybrid_enabled: true,
        identity_verified: true,
        pq_identity_attested: true,
      } satisfies EnvelopeCapabilityResult;
    },
    platform: () => "web",
    identity_fingerprint: async () => "fixed-fingerprint",
    pq_identity_fingerprint: async () => "fixed-pq-fingerprint",
  };

  if (one_time_prekeys_readable) {
    deps.one_time_prekeys_readable = one_time_prekeys_readable;
  }

  return { deps, reported };
}

describe("reported handshake version", () => {
  it("keeps the read ceiling one above the write ceiling", () => {
    expect(ENVELOPE_CAPABILITY_X3DH_MAX_VERSION).toBe(X3DH_VERSION_MAX);
    expect(ENVELOPE_CAPABILITY_X3DH_ONE_TIME_VERSION).toBe(
      X3DH_READ_VERSION_MAX,
    );
  });

  it("reports the key bound version when nothing says one-time keys are readable", async () => {
    expect(await resolve_reported_x3dh_version()).toBe(3);
    expect(await resolve_reported_x3dh_version(async () => false)).toBe(3);
  });

  it("reports the key bound version when the storage probe fails", async () => {
    expect(
      await resolve_reported_x3dh_version(async () => {
        throw new Error("storage closed");
      }),
    ).toBe(3);
  });

  it("reports the key bound version for a probe result that is not exactly true", async () => {
    expect(
      await resolve_reported_x3dh_version(
        async () => "yes" as unknown as boolean,
      ),
    ).toBe(3);
  });

  it("reports the one-time bound version only when one-time keys are readable", async () => {
    expect(await resolve_reported_x3dh_version(async () => true)).toBe(4);
  });

  it("posts the key bound version without one-time key storage", async () => {
    const without_probe = make_deps();
    const unreadable = make_deps(async () => false);

    await report_envelope_capability_if_due("user-1", false, without_probe.deps);
    await report_envelope_capability_if_due("user-1", false, unreadable.deps);

    expect(without_probe.reported).toEqual([3]);
    expect(unreadable.reported).toEqual([3]);
  });

  it("posts the one-time bound version with one-time key storage", async () => {
    const readable = make_deps(async () => true);

    await report_envelope_capability_if_due("user-1", false, readable.deps);

    expect(readable.reported).toEqual([4]);
  });
});
