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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encrypt_for_recipients } from "./send_queue_body_encryption";

const h = vi.hoisted(() => ({
  primary: "me@astermail.org" as string | null,
  encrypt_calls: [] as { keys: string[]; signing: unknown }[],
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () =>
    h.primary ? { user: { email: h.primary } } : null,
}));

vi.mock("./api/keys", () => ({
  get_recipient_public_key: async () => ({
    data: { public_key: "recipient-public-key" },
  }),
}));

vi.mock("./crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: async () => undefined,
}));

vi.mock("./crypto/key_manager", () => ({
  encrypt_message_multi: async (
    _body: string,
    keys: string[],
    signing: unknown,
  ) => {
    h.encrypt_calls.push({ keys: [...keys], signing });

    return "ciphertext";
  },
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({
    identity_key: "account-secret-key",
    previous_keys: [],
  }),
  get_passphrase_from_memory: () => "passphrase",
  has_passphrase_in_memory: () => true,
}));

vi.mock("./crypto/ratchet_manager", () => ({
  KeyPinUnavailableError: class extends Error {},
  RecipientPinUnreadableError: class extends Error {},
  RecipientKeyUntrustedError: class extends Error {},
  RecoveryLaneUnavailableError: class extends Error {},
  build_ratchet_envelope: () => "",
  encrypt_for_ratchet_recipient: async () => null,
  is_post_quantum_recipient_data: () => false,
  recipient_post_quantum_status: async () => "missing",
}));

vi.mock("./send_queue_recipients", () => ({
  assert_owner_key_trusted: async () => undefined,
  resolve_own_username_for_key_lookup: async () => "me",
  resolve_username_for_key_lookup: async () => "friend",
}));

vi.mock("@/utils/email_crypto", () => ({
  derive_own_public_key: async () => "account-public-key",
}));

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: async () => ({}),
}));

describe("encrypt_for_recipients without a ratchet session", () => {
  beforeEach(() => {
    h.primary = "me@astermail.org";
    h.encrypt_calls = [];
  });

  it("adds the account key and signs when the primary address sends", async () => {
    await encrypt_for_recipients(
      "body",
      ["friend@astermail.org"],
      "me@astermail.org",
      true,
    );

    expect(h.encrypt_calls).toHaveLength(1);
    expect(h.encrypt_calls[0].keys).toEqual([
      "recipient-public-key",
      "account-public-key",
    ]);
    expect(h.encrypt_calls[0].signing).toBeDefined();
  });

  it("uses only recipient keys and no signature when an alias sends", async () => {
    await encrypt_for_recipients(
      "body",
      ["friend@astermail.org"],
      "shop@astermail.org",
      true,
    );

    expect(h.encrypt_calls).toHaveLength(1);
    expect(h.encrypt_calls[0].keys).toEqual(["recipient-public-key"]);
    expect(h.encrypt_calls[0].signing).toBeUndefined();
  });

  it("uses only recipient keys when a custom domain address sends", async () => {
    await encrypt_for_recipients(
      "body",
      ["friend@astermail.org"],
      "me@my-domain.example",
      true,
    );

    expect(h.encrypt_calls[0].keys).toEqual(["recipient-public-key"]);
    expect(h.encrypt_calls[0].signing).toBeUndefined();
  });
});
