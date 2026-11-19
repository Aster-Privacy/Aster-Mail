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
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requests: [] as string[],
}));

vi.mock("@/services/api/client/api_client", () => ({
  api_client: {
    get: vi.fn(async (path: string) => {
      h.requests.push(path);

      return { error: "User not found", code: "NOT_FOUND" };
    }),
  },
}));

vi.mock("@/services/crypto/address_identity_directory", () => ({
  resolve_address_send_state: vi.fn(async () => "active"),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({
    user: { email: "hello@astermail.org", username: "hello" },
  }),
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  get_vault_from_memory: () => ({
    identity_key: "SECRET_KEY",
    ratchet_identity_key: "RATCHET_SECRET",
    ratchet_identity_public: "RATCHET_PUBLIC",
  }),
  get_passphrase_from_memory: () => "passphrase",
  has_passphrase_in_memory: () => true,
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => "ciphertext"),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  check_owner_key_pin: vi.fn(async () => "ok"),
  flag_recipient_untrusted: vi.fn(async () => {}),
  is_recipient_flagged_untrusted: vi.fn(async () => false),
}));

vi.mock("@/services/crypto/ratchet_manager", () => ({
  KeyPinUnavailableError: class extends Error {},
  RecipientPinUnreadableError: class extends Error {},
  RecipientKeyUntrustedError: class extends Error {},
  RecoveryLaneUnavailableError: class extends Error {},
  build_ratchet_envelope: vi.fn(),
  encrypt_for_ratchet_recipient: vi.fn(async () => null),
  is_post_quantum_recipient_data: vi.fn(() => false),
  recipient_post_quantum_status: vi.fn(async () => "unsupported"),
}));

vi.mock("@/utils/email_crypto", () => ({
  derive_own_public_key: vi.fn(async () => "OWN_KEY"),
}));

import { encrypt_for_recipients } from "./send_queue_body_encryption";
import { fetch_internal_public_keys } from "./send_queue_recipients";

import { en } from "@/lib/i18n/translations/en";

const UNKNOWN = "greenmile@astermail.org";

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }

  throw new Error("expected the send to be refused");
}

describe("sending to an Aster address with no account behind it", () => {
  beforeEach(() => {
    h.requests.length = 0;
  });

  it("names the address instead of citing required encryption", async () => {
    const err = await rejection(
      encrypt_for_recipients("body", [UNKNOWN], "hello@astermail.org", true),
    );

    expect(h.requests).toEqual([
      "/crypto/v1/keys/public/greenmile?email=greenmile%40astermail.org",
    ]);
    expect(err.message).toBe(
      en.errors.recipient_not_on_aster.replace("{{recipients}}", UNKNOWN),
    );
    expect(err.message).not.toBe(en.errors.cannot_send_no_recipient_keys);
  });

  it("uses the same wording when attachments look up the key", async () => {
    const err = await rejection(fetch_internal_public_keys([UNKNOWN]));

    expect(err.message).toBe(
      en.errors.recipient_not_on_aster.replace("{{recipients}}", UNKNOWN),
    );
  });

  it("keeps the retry wording when the lookup fails for another reason", async () => {
    const { api_client } = await import("@/services/api/client/api_client");

    vi.mocked(api_client.get).mockResolvedValueOnce({
      error: "Server error",
      code: "SERVER_ERROR",
    } as never);

    const err = await rejection(fetch_internal_public_keys([UNKNOWN]));

    expect(err.message).toBe(en.errors.failed_encrypt_envelope);
  });
});
