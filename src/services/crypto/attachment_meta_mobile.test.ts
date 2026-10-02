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
import { describe, it, expect, beforeEach, vi } from "vitest";

const mobile_key = vi.hoisted(() => ({ value: null as CryptoKey | null }));
const passphrase = vi.hoisted(() => ({ bytes: null as Uint8Array | null }));

vi.mock("./memory_key_store", () => ({
  get_passphrase_bytes: vi.fn(() =>
    passphrase.bytes ? new Uint8Array(passphrase.bytes) : null,
  ),
  get_passphrase_from_memory: vi.fn(() => null),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => {
    throw new Error("pgp encryption must not run in this suite");
  }),
  decrypt_message_with_any_key: vi.fn(async () => {
    throw new Error("pgp decryption must not run in this suite");
  }),
}));

vi.mock("@/services/crypto/legacy_ios_envelope", () => ({
  decrypt_legacy_ios_envelope: vi.fn(
    async (ciphertext: Uint8Array, nonce: Uint8Array) => {
      if (!mobile_key.value) return null;

      try {
        return await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: nonce },
          mobile_key.value,
          ciphertext,
        );
      } catch {
        return null;
      }
    },
  ),
}));

import {
  decrypt_attachment_meta,
  clear_unreadable_attachment_rows,
  AttachmentKeyUnavailableError,
} from "./attachment_crypto";
import { array_to_base64 } from "./envelope";
import { clear_attachment_keys } from "./inbound_attachment_keys";

const MAIL_ITEM_ID = "mail-item-mobile-sent";

async function seal_mobile_meta(meta: object, key: CryptoKey) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  nonce[0] = nonce[0] === 0 ? 1 : nonce[0];

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(meta)),
  );

  return {
    encrypted_meta: array_to_base64(new Uint8Array(ciphertext)),
    meta_nonce: array_to_base64(nonce),
  };
}

async function new_mobile_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

describe("attachment metadata sent from the mobile app", () => {
  beforeEach(() => {
    clear_attachment_keys();
    clear_unreadable_attachment_rows();
    mobile_key.value = null;
    passphrase.bytes = null;
  });

  it("reads a sent copy sealed with the password-derived key", async () => {
    const key = await new_mobile_key();

    mobile_key.value = key;
    passphrase.bytes = new TextEncoder().encode("correct horse");

    const session_key = array_to_base64(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const row = await seal_mobile_meta(
      {
        filename: "IMG_0042.jpeg",
        content_type: "image/jpeg",
        session_key,
      },
      key,
    );

    const meta = await decrypt_attachment_meta(
      row.encrypted_meta,
      row.meta_nonce,
      MAIL_ITEM_ID,
      0,
    );

    expect(meta.filename).toBe("IMG_0042.jpeg");
    expect(meta.content_type).toBe("image/jpeg");
    expect(meta.session_key).toBe(session_key);
  });

  it("reads it while the passphrase bytes are unavailable", async () => {
    const key = await new_mobile_key();

    mobile_key.value = key;

    const row = await seal_mobile_meta(
      {
        filename: "scan.pdf",
        content_type: "",
        session_key: array_to_base64(new Uint8Array(32).fill(3)),
        content_id: "cid-1",
        is_inline: true,
      },
      key,
    );

    const meta = await decrypt_attachment_meta(
      row.encrypted_meta,
      row.meta_nonce,
      MAIL_ITEM_ID,
      1,
    );

    expect(meta.filename).toBe("scan.pdf");
    expect(meta.content_type).toBe("application/octet-stream");
    expect(meta.content_id).toBe("cid-1");
    expect(meta.is_inline).toBe(true);
  });

  it("still reports a missing key when the mobile key does not match", async () => {
    const row = await seal_mobile_meta(
      {
        filename: "other.txt",
        content_type: "text/plain",
        session_key: array_to_base64(new Uint8Array(32).fill(9)),
      },
      await new_mobile_key(),
    );

    mobile_key.value = await new_mobile_key();
    passphrase.bytes = new TextEncoder().encode("correct horse");

    await expect(
      decrypt_attachment_meta(
        row.encrypted_meta,
        row.meta_nonce,
        MAIL_ITEM_ID,
        2,
      ),
    ).rejects.toBeInstanceOf(AttachmentKeyUnavailableError);
  });
});
