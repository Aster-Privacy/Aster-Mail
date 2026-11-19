//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { afterEach, describe, it, expect, vi } from "vitest";

import { base64_to_array, array_to_base64 } from "./base64";
import { DoubleRatchet, generate_keypair } from "./double_ratchet";
import * as aad_fallback from "./aes_gcm_aad_fallback";

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(),
  encrypted_set: vi.fn(),
  encrypted_delete: vi.fn(),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

const REFUSAL_FLAG = "VITE_REFUSE_UNBOUND_STORED_DATA";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function sender(): Promise<DoubleRatchet> {
  const bob_keypair = await generate_keypair();

  return DoubleRatchet.init_sender(
    new Uint8Array(32).fill(7),
    bob_keypair.public_key,
    "conv-unbound",
  );
}

async function reseal_without_additional_data(
  ciphertext_base64: string,
  nonce_base64: string,
  message_key: Uint8Array,
  plaintext: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    message_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: base64_to_array(nonce_base64) },
    key,
    new TextEncoder().encode(plaintext),
  );

  expect(ciphertext_base64).not.toBe(array_to_base64(new Uint8Array(sealed)));

  return array_to_base64(new Uint8Array(sealed));
}

async function unbound_message() {
  const alice = await sender();
  const { message, message_key } =
    await alice.encrypt_returning_message_key("old desktop copy");
  const ciphertext = await reseal_without_additional_data(
    message.ciphertext,
    message.nonce,
    message_key,
    "old desktop copy",
  );

  return { message: { ...message, ciphertext }, message_key };
}

describe("stored unbound data policy", () => {
  it("accepts unbound stored data until the refusal switch is set", () => {
    expect(aad_fallback.stored_unbound_policy()).toBe("accept_unbound");
  });

  it("refuses unbound stored data once the refusal switch is set", () => {
    vi.stubEnv(REFUSAL_FLAG, "1");

    expect(aad_fallback.stored_unbound_policy()).toBe("refuse_unbound");
  });

  it("opens an unbound ratchet copy while the switch is off", async () => {
    const { message, message_key } = await unbound_message();

    await expect(
      DoubleRatchet.decrypt_with_message_key(message, message_key),
    ).resolves.toBe("old desktop copy");
  });

  it("refuses an unbound ratchet copy once the switch is set", async () => {
    const { message, message_key } = await unbound_message();

    vi.stubEnv(REFUSAL_FLAG, "1");

    await expect(
      DoubleRatchet.decrypt_with_message_key(message, message_key),
    ).rejects.toThrow();
  });

  it("refuses a ratchet copy relabeled as an older header once the switch is set", async () => {
    const { message, message_key } = await unbound_message();

    vi.stubEnv(REFUSAL_FLAG, "1");

    await expect(
      DoubleRatchet.decrypt_with_message_key(
        { ...message, header: { ...message.header, v: 1 } },
        message_key,
      ),
    ).rejects.toThrow(/unbound ratchet message/);
  });

  it("still opens a bound ratchet copy once the switch is set", async () => {
    const alice = await sender();
    const { message, message_key } =
      await alice.encrypt_returning_message_key("current copy");

    vi.stubEnv(REFUSAL_FLAG, "1");

    await expect(
      DoubleRatchet.decrypt_with_message_key(message, message_key),
    ).resolves.toBe("current copy");
  });
});
