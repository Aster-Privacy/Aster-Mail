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
import type { EncryptedVault } from "./key_manager_core";

import { describe, it, expect } from "vitest";

import {
  ENVELOPE_V2_NONCE,
  decrypt_envelope_v2,
  decrypt_envelope_v2_plaintext,
  decrypt_envelope_v2_with_vault,
  encrypt_envelope_v2,
  encrypt_envelope_v2_bytes,
  envelope_sha256_hex,
  envelope_v2_keys_from_vault,
  envelope_v2_write_key,
  is_envelope_v1_nonce,
  is_envelope_v2_nonce,
} from "./envelope_v2";
import { base64_to_array } from "./base64";

const DATA_KEK = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const LEGACY_KEK = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";
const PLAINTEXT = '{"subject":"Vector test","n":7}';
const CIPHERTEXT_CURRENT =
  "oKGio6SlpqeoqaqrrK2ur8DBwsPExcbHyMnKyxmUrphDVc4W9hq0u8Q/kCWAkTj6oNg/L8FnTtfoYrei0cSkxxjeICkSF8UMMji/";
const CIPHERTEXT_LEGACY_ONLY =
  "oKGio6SlpqeoqaqrrK2ur8DBwsPExcbHyMnKywLFIOOJnavHPVGWAESVDuvrt2eV3125NPGXHdSgj9M13jpUGS2PQGNB/A8W43oA";

function key(b64: string): Uint8Array {
  return base64_to_array(b64);
}

function fixed_salt_iv(): { salt: Uint8Array; iv: Uint8Array } {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);

  for (let i = 0; i < 16; i += 1) salt[i] = 0xa0 + i;
  for (let i = 0; i < 12; i += 1) iv[i] = 0xc0 + i;

  return { salt, iv };
}

async function sha256_hex_of(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("envelope v2 vectors", () => {
  it("decrypts the current vector with the data key", async () => {
    expect(
      await decrypt_envelope_v2_plaintext(CIPHERTEXT_CURRENT, [key(DATA_KEK)]),
    ).toBe(PLAINTEXT);
  });

  it("opens the legacy vector only with the legacy key", async () => {
    expect(
      await decrypt_envelope_v2_plaintext(CIPHERTEXT_LEGACY_ONLY, [
        key(DATA_KEK),
      ]),
    ).toBeNull();
    expect(
      await decrypt_envelope_v2_plaintext(CIPHERTEXT_LEGACY_ONLY, [
        key(DATA_KEK),
        key(LEGACY_KEK),
      ]),
    ).toBe(PLAINTEXT);
  });

  it("reproduces both vectors with the fixed salt and iv", async () => {
    const plaintext = new TextEncoder().encode(PLAINTEXT);

    expect(
      await encrypt_envelope_v2_bytes(
        plaintext,
        key(DATA_KEK),
        fixed_salt_iv(),
      ),
    ).toBe(CIPHERTEXT_CURRENT);
    expect(
      await encrypt_envelope_v2_bytes(
        plaintext,
        key(LEGACY_KEK),
        fixed_salt_iv(),
      ),
    ).toBe(CIPHERTEXT_LEGACY_ONLY);
  });

  it("tries the data key and then every legacy key from the vault", async () => {
    const vault = {
      data_kek: DATA_KEK,
      legacy_keks: [{ k: LEGACY_KEK }],
    } as unknown as EncryptedVault;

    expect(envelope_v2_keys_from_vault(vault)).toHaveLength(2);
    expect(
      await decrypt_envelope_v2_with_vault<{ subject: string; n: number }>(
        CIPHERTEXT_LEGACY_ONLY,
        vault,
      ),
    ).toMatchObject({ subject: "Vector test", n: 7 });
  });

  it("writes only with the data key", () => {
    const vault = {
      legacy_keks: [{ k: LEGACY_KEK }],
    } as unknown as EncryptedVault;

    expect(envelope_v2_write_key(vault)).toBeNull();
    expect(
      envelope_v2_write_key({ data_kek: DATA_KEK } as EncryptedVault),
    ).toEqual(key(DATA_KEK));
  });

  it("round trips an object and tags it with the v2 nonce", async () => {
    const sealed = await encrypt_envelope_v2(
      { subject: "Hello", body_text: "World" },
      key(DATA_KEK),
    );

    expect(sealed.nonce).toBe(ENVELOPE_V2_NONCE);
    expect(
      await decrypt_envelope_v2<{ subject: string }>(sealed.encrypted, [
        key(DATA_KEK),
      ]),
    ).toMatchObject({ subject: "Hello" });
  });

  it("hashes the raw stored envelope bytes", async () => {
    expect(await envelope_sha256_hex(CIPHERTEXT_CURRENT)).toBe(
      await sha256_hex_of(base64_to_array(CIPHERTEXT_CURRENT)),
    );
    expect(await envelope_sha256_hex(CIPHERTEXT_CURRENT)).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("recognizes the sentinel nonces", () => {
    expect(is_envelope_v1_nonce("AQ==")).toBe(true);
    expect(is_envelope_v2_nonce("Ag==")).toBe(true);
    expect(is_envelope_v2_nonce("AQ==")).toBe(false);
    expect(is_envelope_v2_nonce("MDEyMzQ1Njc4OTo7")).toBe(false);
    expect(is_envelope_v2_nonce(null)).toBe(false);
  });
});
