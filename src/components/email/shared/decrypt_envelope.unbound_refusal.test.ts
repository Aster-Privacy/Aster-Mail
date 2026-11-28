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
import { afterEach, describe, expect, it, vi } from "vitest";

import { decrypt_inbound_ecies } from "./decrypt_envelope";

import vectors from "@/tests/fixtures/inbound_envelope_vectors.json";
import {
  reset_format_retirements,
  sync_format_retirements,
  with_format_retired,
} from "@/services/format_retirement/record";

function b64_to_bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function identity_jwk(): string {
  const point = b64_to_bytes(vectors.recipient_p256_public_sec1_b64);

  return JSON.stringify({
    kty: "EC",
    crv: "P-256",
    d: b64url(b64_to_bytes(vectors.recipient_p256_private_scalar_b64)),
    x: b64url(point.slice(1, 33)),
    y: b64url(point.slice(33, 65)),
    ext: true,
  });
}

function open_unbound(): Promise<Uint8Array | null> {
  return decrypt_inbound_ecies(
    b64_to_bytes(vectors.ecdh_compressed.envelope_b64),
    b64_to_bytes(vectors.ecdh_compressed.nonce_b64),
    identity_jwk(),
    true,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  reset_format_retirements();
});

describe("unbound inbound envelope refusal", () => {
  it("opens an unbound envelope by default", async () => {
    expect(await open_unbound()).not.toBeNull();
  });

  it("opens it before the marker and refuses it after", async () => {
    vi.stubEnv("VITE_FORMAT_REFUSAL_INBOUND_UNBOUND_MARKER", "after_marker");

    expect(await open_unbound()).not.toBeNull();

    sync_format_retirements({
      format_retirements: with_format_retired(
        {},
        "inbound_unbound_marker",
        1,
        0,
      ),
    });

    expect(await open_unbound()).toBeNull();
  });

  it("refuses it always when the switch says so", async () => {
    vi.stubEnv("VITE_FORMAT_REFUSAL_INBOUND_UNBOUND_MARKER", "always");

    expect(await open_unbound()).toBeNull();
  });
});
