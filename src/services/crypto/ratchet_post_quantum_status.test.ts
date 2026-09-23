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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  bundle: null as Record<string, unknown> | null,
  verification: { verdict: "verified", format: "v2", strict: true } as {
    verdict: string;
    format: string;
    strict: boolean;
  },
  bootstrap: null as Record<string, unknown> | null,
}));

vi.mock("../api/keys", () => ({
  get_recipient_public_key: vi.fn(async () => ({
    data: { public_key: "pgp-public-key" },
  })),
}));

vi.mock("./key_manager_pgp", () => ({
  verify_ratchet_prekey_bundle_detailed: vi.fn(async () => h.verification),
}));

vi.mock("./ratchet_conversation", () => ({
  derive_conversation_id: vi.fn(async () => "conversation"),
  get_sync_encryption_key: vi.fn(async () => null),
  run_serialized_for_conversation: vi.fn((_id: string, fn: () => unknown) =>
    fn(),
  ),
}));

vi.mock("./ratchet_state_store", () => ({
  archive_ratchet_state: vi.fn(),
  load_ratchet_state: vi.fn(async () =>
    h.bootstrap ? { get_bootstrap: () => h.bootstrap } : null,
  ),
  save_ratchet_state: vi.fn(),
}));

vi.mock("./ratchet_prekey_bundle", () => ({
  detect_identity_pin_drift: vi.fn(),
  fetch_prekey_bundle: vi.fn(async () => h.bundle),
  fetch_ratchet_identity: vi.fn(async () => null),
}));

import { recipient_post_quantum_status } from "./ratchet_encrypt";

const pq_key = btoa(String.fromCharCode(...new Uint8Array(1184).fill(7)));

function pq_bundle(): Record<string, unknown> {
  return {
    kem_identity_key: "kem",
    signed_prekey: "spk",
    signed_prekey_signature: "sig",
    pq_kem_public_key: pq_key,
  };
}

describe("recipient_post_quantum_status", () => {
  beforeEach(() => {
    h.bundle = pq_bundle();
    h.verification = { verdict: "verified", format: "v2", strict: true };
    h.bootstrap = null;
  });

  it("reports supported for a verified bundle whose signature covers the post-quantum key", async () => {
    await expect(
      recipient_post_quantum_status("a@astermail.org", "b@aster.cx", "b"),
    ).resolves.toBe("supported");
  });

  it("reports unsupported when the signature does not cover the post-quantum key", async () => {
    h.verification = { verdict: "verified", format: "v1", strict: false };

    await expect(
      recipient_post_quantum_status("a@astermail.org", "b@aster.cx", "b"),
    ).resolves.toBe("unsupported");
  });

  it("reports unsupported for a legacy hash-bound bundle", async () => {
    h.verification = { verdict: "legacy", format: "hash", strict: false };

    await expect(
      recipient_post_quantum_status("a@astermail.org", "b@aster.cx", "b"),
    ).resolves.toBe("unsupported");
  });

  it("reports unsupported for a tampered bundle", async () => {
    h.verification = { verdict: "tampered", format: "v2", strict: false };

    await expect(
      recipient_post_quantum_status("a@astermail.org", "b@aster.cx", "b"),
    ).resolves.toBe("unsupported");
  });

  it("reports unsupported when no bundle is published", async () => {
    h.bundle = null;

    await expect(
      recipient_post_quantum_status("a@astermail.org", "b@aster.cx", "b"),
    ).resolves.toBe("unsupported");
  });

  it("trusts an existing post-quantum session without refetching", async () => {
    h.bootstrap = { pq_ciphertext: "pq" };
    h.verification = { verdict: "legacy", format: "hash", strict: false };

    await expect(
      recipient_post_quantum_status("a@astermail.org", "b@aster.cx", "b"),
    ).resolves.toBe("supported");
  });
});
