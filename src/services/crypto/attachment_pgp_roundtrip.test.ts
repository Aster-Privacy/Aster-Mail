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
import { describe, it, expect, vi, beforeAll } from "vitest";

import { generate_identity_keypair } from "./key_manager_pgp";

const PASSPHRASE = "correct horse battery staple";

let recipient_public_key = "";
let recipient_secret_key = "";

vi.mock("./memory_key_store", () => ({
  get_passphrase_bytes: vi.fn(() => new TextEncoder().encode(PASSPHRASE)),
  get_vault_from_memory: vi.fn(() => ({ identity_key: recipient_secret_key })),
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

function random_bytes(len: number): Uint8Array {
  const out = new Uint8Array(len);

  for (let off = 0; off < len; off += 65536) {
    crypto.getRandomValues(out.subarray(off, Math.min(off + 65536, len)));
  }

  return out;
}

function make_attachment(name: string, mime: string, bytes: Uint8Array): Attachment {
  return {
    id: name,
    name,
    mime_type: mime,
    size_bytes: bytes.byteLength,
    data: bytes.buffer.slice(0),
    is_inline: false,
  } as unknown as Attachment;
}

describe("internal-send attachment round-trip via recipient PGP meta", () => {
  beforeAll(async () => {
    const kp = await generate_identity_keypair("Self", "self@astermail.org", PASSPHRASE);

    recipient_public_key = kp.public_key;
    recipient_secret_key = kp.secret_key;
  }, 30000);

  it("recovers a 1.5MB pdf and a 700KB jpg sealed to the recipient key", async () => {
    const pdf = random_bytes(1_500_000);
    const jpg = random_bytes(700_000);

    const encrypted = await encrypt_attachments_for_send(
      [
        make_attachment("report.pdf", "application/pdf", pdf),
        make_attachment("photo.jpg", "image/jpeg", jpg),
      ],
      [recipient_public_key],
      true,
    );

    expect(encrypted).toHaveLength(2);

    const originals = [pdf, jpg];

    for (let i = 0; i < encrypted.length; i++) {
      const att = encrypted[i];

      // backend stores recipient_encrypted_meta into the encrypted_meta column for the
      // recipient copy; meta_nonce is the placeholder zero nonce
      const meta = await decrypt_attachment_meta(att.recipient_encrypted_meta!);

      expect(typeof meta.session_key).toBe("string");
      expect(meta.session_key.length).toBeGreaterThan(0);

      const decrypted = await decrypt_attachment_data(
        att.encrypted_data,
        att.data_nonce,
        meta.session_key,
        undefined,
        i,
      );

      expect(new Uint8Array(decrypted)).toEqual(originals[i]);
    }
  }, 30000);
});
