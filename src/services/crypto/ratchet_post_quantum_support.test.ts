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
  supports_pq: true,
  peer_advertised_pq: false,
  verification: { verdict: "verified", format: "v2", strict: true } as {
    verdict: string;
    format: string;
    strict: boolean;
  },
  verify_calls: 0,
}));

vi.mock("./ratchet_state_store", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, load_ratchet_state: vi.fn(async () => null) };
});

vi.mock("./ratchet_conversation", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    derive_conversation_id: vi.fn(async () => "conversation"),
  };
});

vi.mock("./ratchet_prekey_bundle", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, fetch_prekey_bundle: vi.fn(async () => h.bundle) };
});

vi.mock("../api/keys", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    get_recipient_public_key: vi.fn(async () => ({
      data: { public_key: "pgp-public-key" },
    })),
  };
});

vi.mock("./key_manager_pgp", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    verify_ratchet_prekey_bundle_detailed: vi.fn(async () => {
      h.verify_calls += 1;

      return h.verification;
    }),
  };
});

vi.mock("./ratchet_identity_pin", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    has_peer_advertised_pq: vi.fn(async () => h.peer_advertised_pq),
  };
});

vi.mock("./x3dh", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, bundle_supports_pq: vi.fn(() => h.supports_pq) };
});

import { recipient_supports_post_quantum } from "./ratchet_encrypt";

const sender = "sender@astermail.org";
const recipient = "recipient@astermail.org";

describe("recipient_supports_post_quantum", () => {
  beforeEach(() => {
    h.bundle = {
      kem_identity_key: "identity",
      signed_prekey: "signed-prekey",
      signed_prekey_signature: "signature",
      pq_kem_public_key: "pq-identity",
    };
    h.supports_pq = true;
    h.peer_advertised_pq = false;
    h.verification = { verdict: "verified", format: "v2", strict: true };
    h.verify_calls = 0;
  });

  it("reports support for a verified v2 bundle", async () => {
    await expect(
      recipient_supports_post_quantum(sender, recipient, "recipient"),
    ).resolves.toBe(true);
  });

  it("reports no support for a bundle the sender would reject", async () => {
    h.verification = { verdict: "verified", format: "v1", strict: false };

    await expect(
      recipient_supports_post_quantum(sender, recipient, "recipient"),
    ).resolves.toBe(false);
  });

  it("reports no support for a tampered bundle", async () => {
    h.verification = { verdict: "tampered", format: "v2", strict: false };

    await expect(
      recipient_supports_post_quantum(sender, recipient, "recipient"),
    ).resolves.toBe(false);
  });

  it("skips verification when the bundle has no post-quantum key", async () => {
    h.supports_pq = false;

    await expect(
      recipient_supports_post_quantum(sender, recipient, "recipient"),
    ).resolves.toBe(false);
    expect(h.verify_calls).toBe(0);
  });

  it("reports no support when the recipient is missing", async () => {
    h.bundle = null;

    await expect(
      recipient_supports_post_quantum(sender, recipient, "recipient"),
    ).resolves.toBe(false);
  });
});
