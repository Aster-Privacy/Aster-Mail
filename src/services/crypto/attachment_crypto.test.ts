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

vi.mock("./memory_key_store", () => ({
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(7)),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => "PGP_ENCRYPTED_META"),
  decrypt_message: vi.fn(),
}));

vi.mock("./secure_memory", () => ({
  zero_uint8_array: vi.fn(),
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  get_attachment_key: vi.fn(),
}));

vi.mock("./envelope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./envelope")>();

  return {
    ...actual,
    encrypt_envelope_with_bytes: vi.fn(async () => ({
      encrypted: "SENDER_META",
    })),
  };
});

import { encrypt_attachments_for_send } from "./attachment_crypto";
import { base64_to_array } from "./envelope";
import type { Attachment } from "@/components/compose/compose_shared";

function make_attachment(): Attachment {
  return {
    id: "att-1",
    name: "secret.pdf",
    mime_type: "application/pdf",
    size_bytes: 4,
    data: new Uint8Array([1, 2, 3, 4]).buffer,
    is_inline: false,
  } as unknown as Attachment;
}

function decode_meta(b64: string): string {
  return new TextDecoder().decode(base64_to_array(b64));
}

describe("encrypt_attachments_for_send recipient-key invariant", () => {
  it("throws instead of leaking when encryption is required but no recipient key exists", async () => {
    await expect(
      encrypt_attachments_for_send([make_attachment()], undefined, true),
    ).rejects.toThrow(/recipient encryption keys unavailable/);
  });

  it("encrypts the recipient meta to the recipient key, never as plaintext json", async () => {
    const result = await encrypt_attachments_for_send(
      [make_attachment()],
      ["RECIPIENT_PUBLIC_KEY"],
      true,
    );

    expect(result).toHaveLength(1);

    const recipient_meta = decode_meta(result[0].recipient_encrypted_meta || "");

    expect(recipient_meta).toBe("PGP_ENCRYPTED_META");
    expect(recipient_meta).not.toContain("session_key");
  });

  it("keeps the legacy non-encrypted send path working when encryption is not required", async () => {
    const result = await encrypt_attachments_for_send(
      [make_attachment()],
      undefined,
      false,
    );

    expect(result).toHaveLength(1);

    const recipient_meta = decode_meta(result[0].recipient_encrypted_meta || "");
    const parsed = JSON.parse(recipient_meta);

    expect(parsed.filename).toBe("secret.pdf");
    expect(typeof parsed.session_key).toBe("string");
  });

  it("does not block an attachment send to an internal ratchet recipient with no PGP key", async () => {
    const recipient_public_keys: string[] = [];

    const result = await encrypt_attachments_for_send(
      [make_attachment()],
      recipient_public_keys.length > 0 ? recipient_public_keys : undefined,
      recipient_public_keys.length > 0,
    );

    expect(result).toHaveLength(1);

    const recipient_meta = decode_meta(result[0].recipient_encrypted_meta || "");
    const parsed = JSON.parse(recipient_meta);

    expect(parsed.filename).toBe("secret.pdf");
    expect(typeof parsed.session_key).toBe("string");
  });

  it("seals attachment meta to the recipient when an internal recipient has a PGP key", async () => {
    const recipient_public_keys = ["RECIPIENT_PUBLIC_KEY"];

    const result = await encrypt_attachments_for_send(
      [make_attachment()],
      recipient_public_keys.length > 0 ? recipient_public_keys : undefined,
      recipient_public_keys.length > 0,
    );

    const recipient_meta = decode_meta(result[0].recipient_encrypted_meta || "");

    expect(recipient_meta).toBe("PGP_ENCRYPTED_META");
    expect(recipient_meta).not.toContain("session_key");
  });
});
