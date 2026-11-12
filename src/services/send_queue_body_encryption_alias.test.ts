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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  primary: "me@astermail.org" as string | null,
  vault: null as unknown,
  encrypt_calls: [] as Array<{ keys: string[]; signed: boolean }>,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () =>
    h.primary ? { user: { email: h.primary } } : null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
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
  encrypt_message_multi: vi.fn(
    async (_body: string, keys: string[], signing: unknown) => {
      h.encrypt_calls.push({ keys: [...keys], signed: Boolean(signing) });

      return "ciphertext";
    },
  ),
}));

vi.mock("@/services/crypto/ratchet_manager", () => ({
  KeyPinUnavailableError: class extends Error {},
  RecipientPinUnreadableError: class extends Error {},
  RecipientKeyUntrustedError: class extends Error {},
  RecoveryLaneUnavailableError: class extends Error {},
  build_ratchet_envelope: vi.fn(),
  encrypt_for_ratchet_recipient: vi.fn(),
  is_post_quantum_recipient_data: vi.fn(() => false),
  recipient_post_quantum_status: vi.fn(),
}));

vi.mock("@/services/api/keys", () => ({
  get_recipient_public_key: vi.fn(async () => ({
    data: { public_key: "PEER_KEY" },
  })),
}));

vi.mock("@/services/send_queue_recipients", () => ({
  assert_owner_key_trusted: vi.fn(async () => {}),
  resolve_own_username_for_key_lookup: vi.fn(async () => "me"),
  resolve_username_for_key_lookup: vi.fn(async () => "peer"),
}));

vi.mock("@/services/recipient_classification", () => ({
  is_internal_recipient: () => true,
}));

vi.mock("@/utils/email_crypto", () => ({
  derive_own_public_key: vi.fn(async () => "OWN_KEY"),
}));

import {
  encrypt_for_recipients,
  resolve_sender_identity,
} from "./send_queue_body_encryption";

const PGP_ONLY_VAULT = {
  identity_key: "SECRET_KEY",
} as unknown as EncryptedVault;

describe("classic encryption for another Aster address", () => {
  beforeEach(() => {
    h.primary = "me@astermail.org";
    h.vault = PGP_ONLY_VAULT;
    h.encrypt_calls.length = 0;
  });

  it("adds and signs with the account key for the primary address", async () => {
    const result = await encrypt_for_recipients(
      "body",
      ["peer@astermail.org"],
      "me@astermail.org",
      true,
    );

    expect(result.encrypted_body).toBe("ciphertext");
    expect(h.encrypt_calls).toEqual([
      { keys: ["PEER_KEY", "OWN_KEY"], signed: true },
    ]);
  });

  it("uses only recipient keys for an alias", async () => {
    await encrypt_for_recipients(
      "body",
      ["peer@astermail.org"],
      "shop@astermail.org",
      true,
    );

    expect(h.encrypt_calls).toEqual([{ keys: ["PEER_KEY"], signed: false }]);
  });

  it("uses only recipient keys for a custom domain address", async () => {
    await encrypt_for_recipients(
      "body",
      ["peer@astermail.org"],
      "me@my-domain.example",
      true,
    );

    expect(h.encrypt_calls).toEqual([{ keys: ["PEER_KEY"], signed: false }]);
  });

  it("uses only recipient keys when the primary address is unknown", async () => {
    h.primary = null;

    await encrypt_for_recipients(
      "body",
      ["peer@astermail.org"],
      "me@astermail.org",
      true,
    );

    expect(h.encrypt_calls).toEqual([{ keys: ["PEER_KEY"], signed: false }]);
  });
});

describe("resolve_sender_identity", () => {
  const vault = {
    ratchet_identity_key: JSON.stringify({
      kty: "EC",
      crv: "P-256",
      d: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
    }),
    ratchet_identity_public: "ACCOUNT_PUBLIC",
  } as unknown as EncryptedVault;

  beforeEach(() => {
    h.primary = "me@astermail.org";
  });

  it("keeps the account key for the primary address", async () => {
    const identity = await resolve_sender_identity("me@astermail.org", vault);

    expect(identity?.identity_public).toBe("ACCOUNT_PUBLIC");
  });

  it("uses a separate key for each other address", async () => {
    const shop = await resolve_sender_identity("shop@astermail.org", vault);
    const domain = await resolve_sender_identity("me@my-domain.example", vault);

    expect(shop?.identity_public).toBeTruthy();
    expect(shop?.identity_public).not.toBe("ACCOUNT_PUBLIC");
    expect(domain?.identity_public).not.toBe("ACCOUNT_PUBLIC");
    expect(domain?.identity_public).not.toBe(shop?.identity_public);
  });
});
