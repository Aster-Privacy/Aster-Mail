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

import type { DecryptedEnvelope } from "@/types/email";

const reencrypt_mail_item_envelope = vi.fn(async () => ({ data: { success: true } }));
const encrypt_envelope_with_identity_key = vi.fn(async (envelope: object) => ({
  encrypted: JSON.stringify(envelope),
  nonce: "bm9uY2U=",
}));
const get_vault_from_memory = vi.fn(() => ({ identity_key: "identity" }));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));
vi.mock("@/services/api/mail", () => ({
  list_encrypted_mail_items: vi.fn(),
  reencrypt_mail_item_envelope: (...args: unknown[]) =>
    reencrypt_mail_item_envelope(...(args as [])),
}));
vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(),
}));
vi.mock("@/services/crypto/envelope", () => ({
  decrypt_envelope_with_bytes: vi.fn(),
  encrypt_envelope_with_identity_key: (...args: unknown[]) =>
    encrypt_envelope_with_identity_key(...(args as [object])),
  base64_to_array: vi.fn(),
  normalize_envelope_from: vi.fn(),
}));
vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_bytes: vi.fn(),
  get_passphrase_from_memory: vi.fn(),
  get_vault_from_memory: () => get_vault_from_memory(),
}));
vi.mock("@/workers/pgp_decrypt_pool", () => ({
  decrypt_pgp_message_parallel: vi.fn(),
}));

import { schedule_legacy_envelope_migration } from "@/hooks/use_search";

function make_envelope(overrides: Partial<DecryptedEnvelope> = {}): DecryptedEnvelope {
  return {
    subject: "Subject",
    body_text: "the real body text",
    body_html: "<p>the real body</p>",
    from: { name: "Alice", email: "alice@example.com" },
    to: [],
    cc: [],
    bcc: [],
    sent_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as DecryptedEnvelope;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("schedule_legacy_envelope_migration", () => {
  beforeEach(() => {
    reencrypt_mail_item_envelope.mockClear();
    encrypt_envelope_with_identity_key.mockClear();
    get_vault_from_memory.mockClear();
  });

  it("re-encrypts the body captured at schedule time even if the caller later strips it", async () => {
    const envelope = make_envelope();

    schedule_legacy_envelope_migration("mut-1", "received", envelope);

    envelope.body_text = "";
    envelope.body_html = "";
    (envelope as { html_body?: string }).html_body = "";

    await flush();

    expect(reencrypt_mail_item_envelope).toHaveBeenCalledTimes(1);
    const sent = encrypt_envelope_with_identity_key.mock
      .calls[0][0] as unknown as DecryptedEnvelope;
    expect(sent.body_text).toBe("the real body text");
    expect(sent.body_html).toBe("<p>the real body</p>");
  });

  it("never re-encrypts an envelope that has no body", async () => {
    schedule_legacy_envelope_migration("empty-1", "received", make_envelope({
      body_text: "",
      body_html: "",
    }));

    await flush();

    expect(reencrypt_mail_item_envelope).not.toHaveBeenCalled();
  });

  it("only ever migrates a given item once", async () => {
    const env = make_envelope();

    schedule_legacy_envelope_migration("once-1", "received", env);
    schedule_legacy_envelope_migration("once-1", "received", env);

    await flush();

    expect(reencrypt_mail_item_envelope).toHaveBeenCalledTimes(1);
  });

  it("ignores non-received items", async () => {
    schedule_legacy_envelope_migration("sent-1", "sent", make_envelope());

    await flush();

    expect(reencrypt_mail_item_envelope).not.toHaveBeenCalled();
  });
});
