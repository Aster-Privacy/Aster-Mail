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
import type { Attachment } from "@/components/compose/compose_shared";

import { describe, it, expect, vi } from "vitest";

vi.mock("./memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(9)),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => "sealed"),
  decrypt_message: vi.fn(async () => "{}"),
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: async () => ({}),
  peek_account_key_capabilities: () => ({
    bound_vault_writes: false,
  }),
}));

import {
  encrypt_attachments_for_send,
  plan_sealed_attachments,
} from "./attachment_crypto";

function make_attachment(bytes: Uint8Array, name: string): Attachment {
  return {
    id: name,
    name,
    mime_type: "application/octet-stream",
    size_bytes: bytes.byteLength,
    data: bytes.buffer.slice(0),
    is_inline: false,
  } as unknown as Attachment;
}

function base64_bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function open_slot(
  key_bytes: Uint8Array,
  nonce_b64: string,
  data_b64: string,
  aad: Uint8Array | null,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const params: AesGcmParams = { name: "AES-GCM", iv: base64_bytes(nonce_b64) };

  if (aad) params.additionalData = aad;

  return crypto.subtle.decrypt(params, key, base64_bytes(data_b64));
}

describe("attachment data binding", () => {
  it("binds every attachment to its slot even when the server reports the switch off", async () => {
    const files = [
      make_attachment(new TextEncoder().encode("first"), "a.txt"),
      make_attachment(new TextEncoder().encode("second"), "b.txt"),
    ];
    const plan = await plan_sealed_attachments(files);
    const keys = plan.session_keys.map((key) => key.slice());
    const encrypted = await encrypt_attachments_for_send(
      files,
      undefined,
      false,
      {},
      null,
      plan.session_keys,
    );

    for (const [seq, item] of encrypted.entries()) {
      const aad = new TextEncoder().encode(
        `aster-attachment-v2|att=${seq}|part=data`,
      );

      await expect(
        open_slot(keys[seq], item.data_nonce, item.encrypted_data, null),
      ).rejects.toThrow();
      await expect(
        open_slot(keys[seq], item.data_nonce, item.encrypted_data, aad),
      ).resolves.toBeInstanceOf(ArrayBuffer);
    }
  });
});
