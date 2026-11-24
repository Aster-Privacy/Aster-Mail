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
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  pgp_attempts: 0,
  recovery: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/services/crypto/vault_key_recovery", () => ({
  keys_added_by_recovery: () => [],
  recover_pgp_keys_from_history: () => h.recovery(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "correct horse battery staple",
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  wait_for_keys_ready: vi.fn(async () => true),
  on_vault_cleared: () => () => {},
  on_keys_ready: () => () => {},
}));

vi.mock("@/services/crypto/vault_refresh", () => ({
  fetch_refreshed_vault: vi.fn(async () => ({
    vault: h.vault,
    encrypted_vault: "server_vault",
    vault_nonce: "n1",
    user_id: "user-1",
  })),
  adopt_refreshed_vault: vi.fn(async () => true),
}));

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: vi.fn(async () => undefined),
}));

vi.mock("@/workers/pgp_decrypt_pool", () => ({
  decrypt_pgp_message_parallel: vi.fn(async () => {
    h.pgp_attempts += 1;
    const error = new Error("Session key decryption failed");

    error.name = "worker_decrypt_error";
    throw error;
  }),
}));

vi.mock("@/services/crypto/legacy_ios_envelope", () => ({
  decrypt_legacy_ios_mail_envelope: vi.fn(async () => null),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: vi.fn(async () => null),
}));

import {
  clear_envelope_cache,
  decrypt_envelope,
} from "@/hooks/email_list_helpers/decrypt";
import { array_to_base64 } from "@/services/crypto/envelope";

const ARMORED = array_to_base64(
  new TextEncoder().encode(
    "-----BEGIN PGP MESSAGE-----\n\nwcBMA0\n-----END PGP MESSAGE-----\n",
  ),
);

describe("list envelopes whose decrypt hits a transient failure", () => {
  beforeEach(() => {
    h.vault = { identity_key: "identity-key-a", previous_keys: [] };
    h.pgp_attempts = 0;
    h.recovery.mockReset();
    clear_envelope_cache();
  });

  it("does not remember a failure caused by a network error", async () => {
    h.recovery.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await decrypt_envelope(ARMORED, "", "pgp-1")).toBe(null);
    const after_first = h.pgp_attempts;

    expect(after_first).toBeGreaterThan(0);

    expect(await decrypt_envelope(ARMORED, "", "pgp-1")).toBe(null);
    expect(h.pgp_attempts).toBeGreaterThan(after_first);
  });

  it("does not remember a failure caused by an aborted request", async () => {
    const aborted = new Error("The operation was aborted");

    aborted.name = "AbortError";
    h.recovery.mockRejectedValue(aborted);

    expect(await decrypt_envelope(ARMORED, "", "pgp-2")).toBe(null);
    const after_first = h.pgp_attempts;

    expect(await decrypt_envelope(ARMORED, "", "pgp-2")).toBe(null);
    expect(h.pgp_attempts).toBeGreaterThan(after_first);
  });

  it("still remembers a failure when every key was tried with ready keys", async () => {
    h.recovery.mockResolvedValue(null);

    expect(await decrypt_envelope(ARMORED, "", "pgp-3")).toBe(null);
    const after_first = h.pgp_attempts;

    expect(await decrypt_envelope(ARMORED, "", "pgp-3")).toBe(null);
    expect(h.pgp_attempts).toBe(after_first);
  });
});
