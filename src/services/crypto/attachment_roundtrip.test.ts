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
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(9)),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => {
    throw new Error("encrypt_message_multi must not run on the no-key path");
  }),
  decrypt_message: vi.fn(async () => {
    throw new Error("decrypt_message must not run on the plaintext-meta path");
  }),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  get_attachment_key: vi.fn(() => ""),
}));

import {
  encrypt_attachments_for_send,
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "./attachment_crypto";
import type { Attachment } from "@/components/compose/compose_shared";

function make_attachment(bytes: Uint8Array): Attachment {
  return {
    id: "att-1",
    name: "report.bin",
    mime_type: "application/octet-stream",
    size_bytes: bytes.byteLength,
    data: bytes.buffer.slice(0),
    is_inline: false,
  } as unknown as Attachment;
}

describe("attachment encrypt -> decrypt real round-trip", () => {
  it("recovers the exact attachment bytes through the real crypto path", async () => {
    const original = crypto.getRandomValues(new Uint8Array(4096));

    const [encrypted] = await encrypt_attachments_for_send(
      [make_attachment(original)],
      undefined,
      false,
    );

    const meta = await decrypt_attachment_meta(
      encrypted.recipient_encrypted_meta!,
    );

    expect(meta.filename).toBe("report.bin");
    expect(typeof meta.session_key).toBe("string");

    const decrypted = await decrypt_attachment_data(
      encrypted.encrypted_data,
      encrypted.data_nonce,
      meta.session_key,
      undefined,
      0,
    );

    expect(new Uint8Array(decrypted)).toEqual(original);
  });

  it("C3 guard fails closed instead of leaking the session key when encryption is required", async () => {
    const original = crypto.getRandomValues(new Uint8Array(16));

    await expect(
      encrypt_attachments_for_send([make_attachment(original)], undefined, true),
    ).rejects.toThrow(/recipient encryption keys unavailable/);
  });
});
