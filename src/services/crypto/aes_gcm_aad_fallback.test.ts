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
import { describe, it, expect } from "vitest";

import { decrypt_aes_gcm_bound_or_unbound } from "./aes_gcm_aad_fallback";

const plaintext = new TextEncoder().encode("sealed payload");
const aad = new TextEncoder().encode("aster.context.v1");

async function make_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(
  key: CryptoKey,
  iv: Uint8Array,
  additional_data?: Uint8Array,
): Promise<Uint8Array> {
  const params: AesGcmParams = additional_data
    ? { name: "AES-GCM", iv, additionalData: additional_data }
    : { name: "AES-GCM", iv };

  return new Uint8Array(await crypto.subtle.encrypt(params, key, plaintext));
}

describe("decrypt_aes_gcm_bound_or_unbound", () => {
  it("opens ciphertext sealed with the additional data", async () => {
    const key = await make_key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(key, iv, aad);

    const opened = await decrypt_aes_gcm_bound_or_unbound(key, iv, sealed, aad);

    expect(new Uint8Array(opened)).toEqual(plaintext);
  });

  it("opens ciphertext sealed without additional data", async () => {
    const key = await make_key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(key, iv);

    const opened = await decrypt_aes_gcm_bound_or_unbound(key, iv, sealed, aad);

    expect(new Uint8Array(opened)).toEqual(plaintext);
  });

  it("rejects ciphertext bound to different additional data", async () => {
    const key = await make_key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(key, iv, new TextEncoder().encode("other"));

    await expect(
      decrypt_aes_gcm_bound_or_unbound(key, iv, sealed, aad),
    ).rejects.toThrow();
  });

  it("rejects ciphertext sealed under another key", async () => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(await make_key(), iv, aad);

    await expect(
      decrypt_aes_gcm_bound_or_unbound(await make_key(), iv, sealed, aad),
    ).rejects.toThrow();
  });
});
