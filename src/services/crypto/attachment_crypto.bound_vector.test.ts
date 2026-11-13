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
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(7)),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(),
  decrypt_message: vi.fn(),
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(
    async (key: CryptoKey, data: Uint8Array, iv: Uint8Array) =>
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data),
  ),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  has_envelope_attachment_keys: () => false,
  get_attachment_key: vi.fn(() => ""),
  get_attachment_entry: vi.fn(() => null),
}));

import { decrypt_attachment_data } from "./attachment_crypto";
import { array_to_base64, base64_to_array } from "./envelope";

const key = Uint8Array.from({ length: 32 }, (_, i) => i);
const nonce = Uint8Array.from({ length: 12 }, (_, i) => i + 100);
const plaintext = "bound attachment vector";
const bound_vector = "KnSrCB3JN+pKAzyAtwAEiWK0Y2n/A4EnWy1F74Tph6cRl+lEq4yU";

function text(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(new Uint8Array(buffer));
}

describe("bound attachment interop vector", () => {
  it("opens the vector shared with Android and Bridge", async () => {
    const out = await decrypt_attachment_data(
      bound_vector,
      array_to_base64(nonce),
      array_to_base64(key),
      "item-1",
      3,
    );

    expect(text(out)).toBe(plaintext);
  });

  it("refuses the vector at another attachment slot", async () => {
    await expect(
      decrypt_attachment_data(
        bound_vector,
        array_to_base64(nonce),
        array_to_base64(key),
        "item-1",
        4,
      ),
    ).rejects.toThrow();
  });

  it("refuses a tampered vector", async () => {
    const sealed = base64_to_array(bound_vector);

    sealed[0] ^= 1;

    await expect(
      decrypt_attachment_data(
        array_to_base64(sealed),
        array_to_base64(nonce),
        array_to_base64(key),
        "item-1",
        3,
      ),
    ).rejects.toThrow();
  });
});
