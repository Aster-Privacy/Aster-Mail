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
import { beforeEach, describe, it, expect, vi } from "vitest";

const capabilities = vi.hoisted(() => ({
  value: {
    split_attachment_copies: true,
  },
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: vi.fn(async () => capabilities.value),
  peek_account_key_capabilities: vi.fn(() => capabilities.value),
}));

vi.mock("./memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(7)),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(
    async (plaintext: string) => `SEALED:${plaintext}`,
  ),
  decrypt_message: vi.fn(),
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  has_envelope_attachment_keys: () => false,
  get_attachment_key: vi.fn(),
  get_attachment_entry: vi.fn(() => null),
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

const FILE_BYTES = new Uint8Array([10, 20, 30, 40, 50]);

interface SentAttachment {
  encrypted_data: string;
  data_nonce: string;
  recipient_encrypted_meta?: string;
  recipient_metas?: Record<string, string>;
  internal_encrypted_data?: string;
  internal_data_nonce?: string;
}

function make_attachment(): Attachment {
  return {
    id: "att-1",
    name: "report.pdf",
    mime_type: "application/pdf",
    size_bytes: FILE_BYTES.length,
    data: FILE_BYTES.slice().buffer,
    is_inline: false,
  } as unknown as Attachment;
}

function decode_text(b64: string): string {
  return new TextDecoder().decode(base64_to_array(b64));
}

function session_key_of(meta_json: string): Uint8Array {
  return base64_to_array(JSON.parse(meta_json).session_key);
}

async function open_with(
  raw_key: Uint8Array,
  data_b64: string,
  nonce_b64: string,
): Promise<Uint8Array | null> {
  const key = await crypto.subtle.importKey(
    "raw",
    raw_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64_to_array(nonce_b64),
        additionalData: new TextEncoder().encode(
          "aster-attachment-v2|att=0|part=data",
        ),
      },
      key,
      base64_to_array(data_b64),
    );

    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

function stored_copy(sent: SentAttachment): { data: string; nonce: string } {
  return sent.internal_encrypted_data && sent.internal_data_nonce
    ? { data: sent.internal_encrypted_data, nonce: sent.internal_data_nonce }
    : { data: sent.encrypted_data, nonce: sent.data_nonce };
}

async function send_split(): Promise<SentAttachment> {
  const [sent] = await encrypt_attachments_for_send(
    [make_attachment()],
    ["ASTER_PUBLIC_KEY"],
    false,
    { "hidden@astermail.org": ["HIDDEN_KEY"] },
    ["friend@astermail.org"],
  );

  return sent as SentAttachment;
}

describe("attachments in a send to Aster and outside recipients", () => {
  beforeEach(() => {
    capabilities.value = {
      split_attachment_copies: true,
    };
  });

  it("gives outside recipients a key that cannot open the Aster copies", async () => {
    const sent = await send_split();
    const outside_key = session_key_of(
      decode_text(sent.recipient_encrypted_meta || ""),
    );
    const stored = stored_copy(sent);

    expect(
      await open_with(outside_key, sent.encrypted_data, sent.data_nonce),
    ).toEqual(FILE_BYTES);
    expect(await open_with(outside_key, stored.data, stored.nonce)).toBeNull();
  });

  it("keeps the Aster copies readable with the sealed key", async () => {
    const sent = await send_split();
    const stored = stored_copy(sent);

    for (const sealed of Object.values(sent.recipient_metas ?? {})) {
      const internal_key = session_key_of(
        decode_text(sealed).replace(/^SEALED:/, ""),
      );

      expect(await open_with(internal_key, stored.data, stored.nonce)).toEqual(
        FILE_BYTES,
      );
      expect(
        await open_with(internal_key, sent.encrypted_data, sent.data_nonce),
      ).toBeNull();
    }
  });

  it("sends one copy to a server that does not support separate copies", async () => {
    capabilities.value = { ...capabilities.value, split_attachment_copies: false };

    const sent = await send_split();

    expect(sent.internal_encrypted_data).toBeUndefined();
    expect(sent.internal_data_nonce).toBeUndefined();
  });

  it("sends one copy when every recipient uses Aster", async () => {
    const [sent] = (await encrypt_attachments_for_send(
      [make_attachment()],
      ["ASTER_PUBLIC_KEY"],
      true,
    )) as SentAttachment[];

    expect(sent.internal_encrypted_data).toBeUndefined();
  });
});
