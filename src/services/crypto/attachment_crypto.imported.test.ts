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
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(7)),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(),
  decrypt_message: vi.fn(),
}));

vi.mock("./secure_memory", () => ({
  zero_uint8_array: vi.fn(),
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(
    async (key: CryptoKey, data: Uint8Array, iv: Uint8Array) =>
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data),
  ),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  get_attachment_key: vi.fn(() => ""),
  get_attachment_entry: vi.fn(() => null),
}));

import { decrypt_attachment_data } from "./attachment_crypto";
import { array_to_base64 } from "./envelope";

const pdf_bytes = new TextEncoder().encode("%PDF-1.7 imported attachment");
const zero_nonce = new Uint8Array(12);

function random_bytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function encrypt(key: Uint8Array, nonce: Uint8Array, data: Uint8Array) {
  const crypto_key = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  return new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, crypto_key, data),
  );
}

describe("decrypt_attachment_data for imported mail", () => {
  it("returns stored bytes when a key is present but the data was stored unencrypted", async () => {
    const result = await decrypt_attachment_data(
      array_to_base64(pdf_bytes),
      array_to_base64(zero_nonce),
      array_to_base64(random_bytes(32)),
      "mail-1",
      0,
    );

    expect(new Uint8Array(result)).toEqual(pdf_bytes);
  });

  it("decrypts attachments encrypted with the session key and a random nonce", async () => {
    const key = random_bytes(32);
    const nonce = random_bytes(12);
    const ciphertext = await encrypt(key, nonce, pdf_bytes);

    const result = await decrypt_attachment_data(
      array_to_base64(ciphertext),
      array_to_base64(nonce),
      array_to_base64(key),
      "mail-1",
      0,
    );

    expect(new Uint8Array(result)).toEqual(pdf_bytes);
  });

  it("still rejects ciphertext that fails to decrypt with a random nonce", async () => {
    const nonce = random_bytes(12);
    const ciphertext = await encrypt(random_bytes(32), nonce, pdf_bytes);

    await expect(
      decrypt_attachment_data(
        array_to_base64(ciphertext),
        array_to_base64(nonce),
        array_to_base64(random_bytes(32)),
        "mail-1",
        0,
      ),
    ).rejects.toThrow();
  });

  it("returns stored bytes when no key exists and the nonce is zero", async () => {
    const result = await decrypt_attachment_data(
      array_to_base64(pdf_bytes),
      array_to_base64(zero_nonce),
      "",
    );

    expect(new Uint8Array(result)).toEqual(pdf_bytes);
  });
});
