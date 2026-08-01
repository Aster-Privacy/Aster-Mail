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
import { describe, it, expect, vi } from "vitest";
import * as openpgp from "openpgp";

import type { DecryptedEnvelope } from "@/types/email";

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(() => null),
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => null),
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(7)),
  has_vault_in_memory: vi.fn(() => false),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  detect_unsubscribe_info: () => undefined,
}));

import {
  decode_password_protected_body,
  decrypt_pgp_with_password,
  is_password_protected_body,
} from "@/utils/email_crypto";
import {
  process_envelope_body,
  build_preview_text,
} from "./build_email_from_envelope";

const PASSPHRASE = "shared-out-of-band-2026";

async function password_encrypted_body(text: string): Promise<string> {
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    passwords: [PASSPHRASE],
    format: "armored",
  });

  return `You have received a secure message.\n\nOpen it here: https://example.test/secure/abc\n\n${encrypted.toString()}\n`;
}

function make_envelope(body_text: string): DecryptedEnvelope {
  return {
    version: 1,
    from: { email: "sender@example.test", name: "Sender" },
    to: [{ email: "recipient@astermail.org", name: "" }],
    cc: [],
    bcc: [],
    subject: "Secure message",
    sent_at: "2026-08-01T12:00:00.000Z",
    body_text,
    body_html: "",
  } as unknown as DecryptedEnvelope;
}

describe("password protected mail through the envelope pipeline", () => {
  it("keeps the payload out of html and preview", async () => {
    const envelope = make_envelope(
      await password_encrypted_body("invoice INV-2026-8841"),
    );
    const result = await process_envelope_body(envelope);

    expect(is_password_protected_body(result.body_text)).toBe(true);
    expect(result.safe_html).toBeUndefined();
    expect(build_preview_text(result.body_text, result.safe_html)).toBe("");
  });

  it("keeps the block decryptable after the pipeline", async () => {
    const envelope = make_envelope(
      await password_encrypted_body("invoice INV-2026-8841"),
    );
    const result = await process_envelope_body(envelope);
    const payload = decode_password_protected_body(result.body_text);

    expect(await decrypt_pgp_with_password(payload.block, PASSPHRASE)).toBe(
      "invoice INV-2026-8841",
    );
    expect(payload.rest).toContain("https://example.test/secure/abc");
  });

  it("leaves ordinary bodies alone", async () => {
    const envelope = make_envelope("just a normal message");
    const result = await process_envelope_body(envelope);

    expect(result.body_text).toBe("just a normal message");
    expect(is_password_protected_body(result.body_text)).toBe(false);
    expect(build_preview_text(result.body_text, result.safe_html)).toBe(
      "just a normal message",
    );
  });
});
