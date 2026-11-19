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
import { sha256 } from "@noble/hashes/sha256";
import { afterEach, describe, expect, it } from "vitest";

import { array_to_base64 } from "./base64";
import {
  append_legacy_key_raw_bytes,
  clear_legacy_keks_from_memory,
  decrypt_with_legacy_derived_keys,
  get_legacy_crypto_keys,
  load_legacy_keks_into_memory,
} from "./legacy_keks";

const PURPOSE = new TextEncoder().encode("public-constant-test");
const ADDED_AT = "2026-01-01T00:00:00Z";

const PLACEHOLDER_CASES: [string, string][] = [
  ["null", "astermail-tags-v1"],
  ["", "astermail-draft-v2"],
  ["null", "astermail-envelope-v1"],
  ["", "astermail-import-v1"],
  ["null", "astermail-scheduled-v1"],
];

function public_raw(material: string, context: string): Uint8Array {
  return sha256(new TextEncoder().encode(material + context));
}

async function derive_from_base(base: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: PURPOSE },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal_under(
  raw: Uint8Array,
  text: string,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
    "deriveKey",
  ]);
  const key = await derive_from_base(base);
  const iv = new Uint8Array(12).fill(7);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(text),
    ),
  );

  return { ciphertext, iv };
}

afterEach(() => {
  clear_legacy_keks_from_memory();
});

describe("legacy keys from public constants", () => {
  it.each(PLACEHOLDER_CASES)(
    "does not load the %j + %s constant as a private legacy key",
    async (material, context) => {
      const raw = public_raw(material, context);

      await load_legacy_keks_into_memory([
        { k: array_to_base64(raw), added_at: ADDED_AT },
      ]);

      expect(get_legacy_crypto_keys()).toHaveLength(0);
    },
  );

  it.each(PLACEHOLDER_CASES)(
    "does not open escrow-style data keyed to the %j + %s constant",
    async (material, context) => {
      const raw = public_raw(material, context);
      const sealed = await seal_under(raw, "planted");

      await load_legacy_keks_into_memory([
        { k: array_to_base64(raw), added_at: ADDED_AT },
      ]);

      expect(
        await decrypt_with_legacy_derived_keys(
          derive_from_base,
          sealed.ciphertext,
          sealed.iv,
        ),
      ).toBeNull();
    },
  );

  it.each(PLACEHOLDER_CASES)(
    "does not append the %j + %s constant as a private legacy key",
    async (material, context) => {
      await append_legacy_key_raw_bytes(public_raw(material, context));

      expect(get_legacy_crypto_keys()).toHaveLength(0);
    },
  );

  it("still loads and opens with a random legacy key", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await seal_under(raw, "kept");

    await load_legacy_keks_into_memory([
      { k: array_to_base64(raw), added_at: ADDED_AT },
    ]);

    expect(get_legacy_crypto_keys()).toHaveLength(1);
    const opened = await decrypt_with_legacy_derived_keys(
      derive_from_base,
      sealed.ciphertext,
      sealed.iv,
    );

    expect(new TextDecoder().decode(opened!)).toBe("kept");
  });
});
