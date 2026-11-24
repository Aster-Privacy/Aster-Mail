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
  decrypt: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  on_keys_ready: () => () => {},
  are_keys_ready: () => h.vault !== null,
  has_passphrase_in_memory: () => h.vault !== null,
  has_vault_in_memory: () => h.vault !== null,
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => null,
  wait_for_keys_ready: vi.fn(async () => false),
}));

vi.mock("@/services/crypto/ratchet_manager", () => ({
  parse_ratchet_envelope: (body: string) =>
    body.includes('"type":"double_ratchet"')
      ? { type: "double_ratchet" }
      : null,
  decrypt_ratchet_message: (...args: unknown[]) => h.decrypt(...args),
}));

import { try_decrypt_ratchet_body } from "@/utils/email_crypto";
import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  is_undecryptable_body,
} from "@/utils/undecryptable_body";

const RATCHET_BODY = '{"type":"double_ratchet","header":"h","ciphertext":"c"}';
const VAULT = { identity_key: "identity-key-a" };

function named_error(name: string, message = name): Error {
  const error = new Error(message);

  error.name = name;

  return error;
}

describe("ratchet bodies decrypted before the keys settle", () => {
  beforeEach(() => {
    h.vault = null;
    h.decrypt.mockReset();
    h.decrypt.mockResolvedValue("Hello from the other side");
  });

  it("stays pending while the keys are not ready, then decrypts once", async () => {
    const first = await try_decrypt_ratchet_body(
      RATCHET_BODY,
      "me@astermail.org",
      "them@astermail.org",
      "m1",
    );

    expect(is_undecryptable_body(first)).toBe(false);
    expect(first).not.toBe(RATCHET_BODY);
    expect(h.decrypt).not.toHaveBeenCalled();

    h.vault = VAULT;

    const second = await try_decrypt_ratchet_body(
      RATCHET_BODY,
      "me@astermail.org",
      "them@astermail.org",
      "m1",
    );

    expect(second).toBe("Hello from the other side");
    expect(h.decrypt).toHaveBeenCalledTimes(1);
  });

  it("stays pending when the escrow copy is unavailable", async () => {
    h.vault = VAULT;
    h.decrypt.mockRejectedValue(
      named_error("EscrowUnavailableError", "escrow lookup unavailable"),
    );

    const body = await try_decrypt_ratchet_body(
      RATCHET_BODY,
      "me@astermail.org",
      "them@astermail.org",
      "m2",
    );

    expect(is_undecryptable_body(body)).toBe(false);
    expect(body).not.toBe(RATCHET_BODY);
  });

  it("stays pending when the attempt is aborted", async () => {
    h.vault = VAULT;
    h.decrypt.mockRejectedValue(
      named_error("AbortError", "The operation was aborted"),
    );

    const body = await try_decrypt_ratchet_body(
      RATCHET_BODY,
      "me@astermail.org",
      "them@astermail.org",
      "m3",
    );

    expect(is_undecryptable_body(body)).toBe(false);
    expect(body).not.toBe(RATCHET_BODY);
  });

  it("stays pending when a network request fails during the attempt", async () => {
    h.vault = VAULT;
    h.decrypt.mockRejectedValue(new TypeError("Failed to fetch"));

    const body = await try_decrypt_ratchet_body(
      RATCHET_BODY,
      "me@astermail.org",
      "them@astermail.org",
      "m4",
    );

    expect(is_undecryptable_body(body)).toBe(false);
  });

  it("still reports a message that cannot be decrypted with ready keys", async () => {
    h.vault = VAULT;
    h.decrypt.mockResolvedValue(null);

    const body = await try_decrypt_ratchet_body(
      RATCHET_BODY,
      "me@astermail.org",
      "them@astermail.org",
      "m5",
    );

    expect(body).toBe(RATCHET_UNDECRYPTABLE_SENTINEL);
  });

  it("still reports a message whose ratchet payload fails authentication", async () => {
    h.vault = VAULT;
    h.decrypt.mockRejectedValue(
      named_error("OperationError", "The operation failed"),
    );

    const body = await try_decrypt_ratchet_body(
      RATCHET_BODY,
      "me@astermail.org",
      "them@astermail.org",
      "m6",
    );

    expect(body).toBe(RATCHET_UNDECRYPTABLE_SENTINEL);
  });
});
