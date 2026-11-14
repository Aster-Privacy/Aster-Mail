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
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  v2_payload: null as unknown,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  on_keys_ready: () => () => {},
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "correct horse battery staple",
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  has_vault_in_memory: () => h.vault !== null,
  wait_for_keys_ready: vi.fn(async () => {}),
  store_vault_in_memory: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ code: "NOT_FOUND" })),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/account_manager", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/services/crypto/envelope_v2", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  decrypt_envelope_v2_with_vault: vi.fn(async () =>
    h.v2_payload ? JSON.parse(JSON.stringify(h.v2_payload)) : null,
  ),
}));

import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  clear_envelope_cache,
  decrypt_envelope,
} from "@/hooks/email_list_helpers/decrypt";
import { decrypt_envelope_for_search } from "@/hooks/use_search/envelope";
import {
  array_to_base64,
  encrypt_envelope_with_bytes,
  encrypt_envelope_with_identity_key,
} from "@/services/crypto/envelope";

const IDENTITY_KEY = "current-identity-key";
const V2_NONCE = array_to_base64(new Uint8Array([2]));

const PAYLOAD = {
  version: 1,
  subject: "Quarterly notes",
  body_text: "Body text",
  from: { name: "Aster", email: "hello@astermail.org" },
  to: [{ name: "", email: "owner@astermail.org" }],
  cc: [],
  bcc: [],
  sent_at: "2026-11-01T10:00:00.000Z",
  sender_verification: "verified",
};

type Opener = (
  encrypted: string,
  nonce: string,
) => Promise<DecryptedEnvelope | null>;

const OPENERS: Array<[string, Opener]> = [
  [
    "viewer",
    (encrypted, nonce) =>
      decrypt_mail_envelope<DecryptedEnvelope>(encrypted, nonce, "m1"),
  ],
  ["list", (encrypted, nonce) => decrypt_envelope(encrypted, nonce, "m1")],
  [
    "search",
    (encrypted, nonce) =>
      decrypt_envelope_for_search(encrypted, nonce, "m1", "received"),
  ],
];

async function sealed_copies(): Promise<
  Array<[string, { encrypted: string; nonce: string }]>
> {
  return [
    [
      "plain",
      {
        encrypted: array_to_base64(
          new TextEncoder().encode(JSON.stringify(PAYLOAD)),
        ),
        nonce: "",
      },
    ],
    [
      "passphrase",
      await encrypt_envelope_with_bytes(PAYLOAD, new Uint8Array(32).fill(1)),
    ],
    ["vault", { encrypted: "AAAA", nonce: V2_NONCE }],
    [
      "identity key",
      await encrypt_envelope_with_identity_key(PAYLOAD, IDENTITY_KEY),
    ],
  ];
}

describe("stored sender verification is never read from an envelope", () => {
  beforeEach(() => {
    h.vault = { identity_key: IDENTITY_KEY };
    h.v2_payload = PAYLOAD;
    clear_envelope_cache();
    localStorage.clear();
  });

  for (const [opener_name, open] of OPENERS) {
    it(`drops it in the ${opener_name} for every envelope format`, async () => {
      for (const [format, copy] of await sealed_copies()) {
        const envelope = await open(copy.encrypted, copy.nonce);

        expect(envelope, format).not.toBeNull();
        expect(envelope?.subject, format).toBe("Quarterly notes");
        expect(envelope?.from?.email, format).toBe("hello@astermail.org");
        expect(
          (envelope as unknown as Record<string, unknown>).sender_verification,
          format,
        ).toBeUndefined();
      }
    });
  }
});
