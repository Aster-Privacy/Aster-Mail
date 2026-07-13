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
import { describe, it, expect, beforeEach } from "vitest";

import {
  decrypt_aes_gcm_with_fallback,
  load_legacy_keks_into_memory,
  load_previous_key_derived_keks_into_memory,
  clear_legacy_keks_from_memory,
  serialize_kek_for_vault,
} from "./legacy_keks";

const OLD_IDENTITY_KEY = "old-identity-key-material-base64ish";
const NEW_IDENTITY_KEY = "new-identity-key-material-base64ish";
const TAG_CONTEXT = "astermail-tags-v1";
const FOLDER_CONTEXT = "astermail-labels-v1";
const DRAFT_CONTEXT = "astermail-draft-v2";

async function derive_context_key_raw(
  identity_key: string,
  context: string,
): Promise<Uint8Array> {
  const material = new TextEncoder().encode(identity_key + context);
  const hash = await crypto.subtle.digest("SHA-256", material);

  return new Uint8Array(hash);
}

async function derive_context_key(
  identity_key: string,
  context: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const raw = await derive_context_key_raw(identity_key, context);

  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function encrypt_field(
  plaintext: string,
  identity_key: string,
  context: string,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const key = await derive_context_key(identity_key, context, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );

  return { ciphertext: new Uint8Array(encrypted), nonce };
}

async function decrypt_with_current_key(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  context: string,
): Promise<string> {
  const primary = await derive_context_key(NEW_IDENTITY_KEY, context, [
    "decrypt",
  ]);
  const plaintext = await decrypt_aes_gcm_with_fallback(
    primary,
    ciphertext,
    nonce,
  );

  return new TextDecoder().decode(plaintext);
}

describe("tag key survival across identity key rotation", () => {
  beforeEach(() => {
    clear_legacy_keks_from_memory();
  });

  it("fails without any fallback registered", async () => {
    const { ciphertext, nonce } = await encrypt_field(
      "Receipts",
      OLD_IDENTITY_KEY,
      TAG_CONTEXT,
    );

    await expect(
      decrypt_with_current_key(ciphertext, nonce, TAG_CONTEXT),
    ).rejects.toThrow();
  });

  it("decrypts old tag names via previous_keys derived fallback", async () => {
    const { ciphertext, nonce } = await encrypt_field(
      "Receipts",
      OLD_IDENTITY_KEY,
      TAG_CONTEXT,
    );

    await load_previous_key_derived_keks_into_memory([OLD_IDENTITY_KEY]);

    await expect(
      decrypt_with_current_key(ciphertext, nonce, TAG_CONTEXT),
    ).resolves.toBe("Receipts");
  });

  it("decrypts old folder names via previous_keys derived fallback", async () => {
    const { ciphertext, nonce } = await encrypt_field(
      "Invoices",
      OLD_IDENTITY_KEY,
      FOLDER_CONTEXT,
    );

    await load_previous_key_derived_keks_into_memory([OLD_IDENTITY_KEY]);

    await expect(
      decrypt_with_current_key(ciphertext, nonce, FOLDER_CONTEXT),
    ).resolves.toBe("Invoices");
  });

  it("decrypts old drafts via previous_keys derived fallback", async () => {
    const { ciphertext, nonce } = await encrypt_field(
      "draft body",
      OLD_IDENTITY_KEY,
      DRAFT_CONTEXT,
    );

    await load_previous_key_derived_keks_into_memory([OLD_IDENTITY_KEY]);

    await expect(
      decrypt_with_current_key(ciphertext, nonce, DRAFT_CONTEXT),
    ).resolves.toBe("draft body");
  });

  it("decrypts old tag names via the persisted legacy kek the rotation service now registers", async () => {
    const { ciphertext, nonce } = await encrypt_field(
      "Receipts",
      OLD_IDENTITY_KEY,
      TAG_CONTEXT,
    );

    const old_tag_hash = await derive_context_key_raw(
      OLD_IDENTITY_KEY,
      TAG_CONTEXT,
    );

    await load_legacy_keks_into_memory([serialize_kek_for_vault(old_tag_hash)]);

    await expect(
      decrypt_with_current_key(ciphertext, nonce, TAG_CONTEXT),
    ).resolves.toBe("Receipts");
  });

  it("keeps handling tags created by a client still holding the pre-rotation key", async () => {
    const { ciphertext, nonce } = await encrypt_field(
      "Created on Android",
      OLD_IDENTITY_KEY,
      TAG_CONTEXT,
    );

    await load_previous_key_derived_keks_into_memory([
      "some-even-older-key",
      OLD_IDENTITY_KEY,
    ]);

    await expect(
      decrypt_with_current_key(ciphertext, nonce, TAG_CONTEXT),
    ).resolves.toBe("Created on Android");
  });
});
