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
  vault: {
    identity_key: "identity",
    ratchet_identity_key: "ratchet-secret",
    ratchet_identity_public: "ratchet-public",
  } as Record<string, unknown> | null,
  ratchet_result: null as unknown,
  supports_pq: true,
  public_key_calls: 0,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "passphrase",
  get_passphrase_bytes: () => new Uint8Array(32).fill(3),
  has_passphrase_in_memory: () => true,
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/ratchet_manager", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    encrypt_for_ratchet_recipient: vi.fn(async () => h.ratchet_result),
    build_ratchet_envelope: vi.fn(() => "ratchet-envelope"),
    recipient_supports_post_quantum: vi.fn(async () => h.supports_pq),
  };
});

vi.mock("@/services/api/keys", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    get_recipient_public_key: vi.fn(async () => {
      h.public_key_calls += 1;

      return { data: { public_key: "pgp-public-key" } };
    }),
  };
});

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { id: "user-1", username: "sender" },
  })),
}));

import {
  encrypt_for_recipients,
  check_post_quantum_coverage,
} from "@/services/send_queue_encryption";
import { PostQuantumUnavailableError } from "@/services/send_queue_types";

const sender = "sender@astermail.org";
const recipient = "recipient@astermail.org";

function post_quantum_result() {
  return {
    header: { n: 0, pn: 0, dh: "dh" },
    ciphertext: "ct",
    nonce: "nonce",
    pq_ciphertext: "pq-ct",
    pq_key_id: -1,
    recovery: { ciphertext: "rc", nonce: "rn" },
  };
}

function classical_result() {
  const result = post_quantum_result() as Record<string, unknown>;

  delete result.pq_ciphertext;
  delete result.pq_key_id;

  return result;
}

describe("fail-closed post-quantum send gate", () => {
  beforeEach(() => {
    h.vault = {
      identity_key: "identity",
      ratchet_identity_key: "ratchet-secret",
      ratchet_identity_public: "ratchet-public",
    };
    h.ratchet_result = post_quantum_result();
    h.supports_pq = true;
    h.public_key_calls = 0;
  });

  it("encrypts normally when every recipient is post-quantum", async () => {
    const result = await encrypt_for_recipients("body", [recipient], sender);

    expect(result.is_encrypted).toBe(true);
    expect(result.encrypted_body).toBe("ratchet-envelope");
  });

  it("refuses a ratchet send that would fall back to classical key agreement", async () => {
    h.ratchet_result = classical_result();

    await expect(
      encrypt_for_recipients("body", [recipient], sender),
    ).rejects.toBeInstanceOf(PostQuantumUnavailableError);
  });

  it("names the recipients that lack post-quantum keys", async () => {
    h.ratchet_result = classical_result();

    const error = await encrypt_for_recipients("body", [recipient], sender)
      .then(() => null)
      .catch((err: PostQuantumUnavailableError) => err);

    expect(error?.recipients).toContain(recipient);
    expect(error?.message).toContain(recipient);
  });

  it("allows the classical send once the sender approves the override", async () => {
    h.ratchet_result = classical_result();

    const result = await encrypt_for_recipients(
      "body",
      [recipient],
      sender,
      true,
    );

    expect(result.is_encrypted).toBe(true);
    expect(result.encrypted_body).toBe("ratchet-envelope");
  });

  it("refuses the internal PGP fallback when the ratchet path is unavailable", async () => {
    h.ratchet_result = null;

    await expect(
      encrypt_for_recipients("body", [recipient], sender),
    ).rejects.toBeInstanceOf(PostQuantumUnavailableError);
    expect(h.public_key_calls).toBe(0);
  });

  it("refuses the internal PGP fallback when the vault has no ratchet keys", async () => {
    h.vault = { identity_key: "identity" };

    await expect(
      encrypt_for_recipients("body", [recipient], sender),
    ).rejects.toBeInstanceOf(PostQuantumUnavailableError);
    expect(h.public_key_calls).toBe(0);
  });

  it("leaves external-only sends to the existing external path", async () => {
    const result = await encrypt_for_recipients(
      "body",
      ["someone@example.com"],
      sender,
    );

    expect(result.is_encrypted).toBe(false);
  });

  it("leaves mixed internal and external sends to the existing path", async () => {
    const result = await encrypt_for_recipients(
      "body",
      [recipient, "someone@example.com"],
      sender,
    );

    expect(result.is_encrypted).toBe(false);
  });
});

describe("compose-time post-quantum preflight", () => {
  beforeEach(() => {
    h.supports_pq = true;
  });

  it("reports no gap when the recipient publishes post-quantum keys", async () => {
    await expect(
      check_post_quantum_coverage([recipient], sender),
    ).resolves.toEqual([]);
  });

  it("reports the recipient when no post-quantum keys are published", async () => {
    h.supports_pq = false;

    await expect(
      check_post_quantum_coverage([recipient], sender),
    ).resolves.toEqual([recipient]);
  });

  it("skips the check for external recipients", async () => {
    h.supports_pq = false;

    await expect(
      check_post_quantum_coverage(["someone@example.com"], sender),
    ).resolves.toEqual([]);
  });

  it("still reports the internal recipient when the send is mixed", async () => {
    h.supports_pq = false;

    await expect(
      check_post_quantum_coverage([recipient, "someone@example.com"], sender),
    ).resolves.toEqual([recipient]);
  });

  it("reports no gap on a mixed send when the internal recipient is covered", async () => {
    await expect(
      check_post_quantum_coverage([recipient, "someone@example.com"], sender),
    ).resolves.toEqual([]);
  });

  it("skips the check when the sender address is unknown", async () => {
    h.supports_pq = false;

    await expect(check_post_quantum_coverage([recipient])).resolves.toEqual([]);
  });
});
