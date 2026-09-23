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
import { afterEach, describe, expect, it } from "vitest";

import {
  ACCOUNT_DATA_CONTEXTS,
  decode_account_key,
  derive_account_data_key_raw,
} from "./account_data_key";
import { array_to_base64 } from "./base64";
import {
  clear_account_key_derived_keks,
  clear_legacy_keks_from_memory,
  decrypt_aes_gcm_with_fallback,
  get_account_key_generation,
  get_legacy_crypto_keys,
  load_account_key_derived_keks_into_memory,
  load_legacy_keks_into_memory,
} from "./legacy_keks";

const ACCOUNT_KEY = Uint8Array.from({ length: 32 }, (_, i) => i);

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function import_aes(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal_with_context(
  account_key: Uint8Array,
  context: (typeof ACCOUNT_DATA_CONTEXTS)[number],
  plaintext: string,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const key = await import_aes(
    await derive_account_data_key_raw(account_key, context),
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );

  return { ciphertext, iv };
}

describe("account data key", () => {
  afterEach(() => {
    clear_legacy_keks_from_memory();
    clear_account_key_derived_keks();
  });

  it("matches the cross-platform vectors", async () => {
    expect(
      to_hex(
        await derive_account_data_key_raw(
          ACCOUNT_KEY,
          "astermail-preferences-v1",
        ),
      ),
    ).toBe("689560f8c35dae5940ef30ae2f047099b93e4c6c846ac1075fe7e50c7b085aa5");
    expect(
      to_hex(
        await derive_account_data_key_raw(ACCOUNT_KEY, "astermail-draft-v2"),
      ),
    ).toBe("adb0a69ec8c6548233dd706fa786375d72820aa2c66574bcd478183a0f705a63");
  });

  it("derives a distinct key for every context", async () => {
    const keys = await Promise.all(
      ACCOUNT_DATA_CONTEXTS.map(async (context) =>
        to_hex(await derive_account_data_key_raw(ACCOUNT_KEY, context)),
      ),
    );

    expect(new Set(keys).size).toBe(ACCOUNT_DATA_CONTEXTS.length);
  });

  it("rejects account keys of the wrong length", async () => {
    expect(decode_account_key(undefined)).toBeNull();
    expect(decode_account_key("")).toBeNull();
    expect(decode_account_key(array_to_base64(new Uint8Array(16)))).toBeNull();
    expect(decode_account_key("not base64!")).toBeNull();
    await expect(
      derive_account_data_key_raw(new Uint8Array(31), "astermail-tags-v1"),
    ).rejects.toThrow();
    expect(decode_account_key(array_to_base64(ACCOUNT_KEY))).toEqual(
      ACCOUNT_KEY,
    );
  });

  it("opens account-key data through the existing fallback readers", async () => {
    const { ciphertext, iv } = await seal_with_context(
      ACCOUNT_KEY,
      "astermail-preferences-v1",
      '{"theme":"dark"}',
    );
    const stale_primary = await import_aes(
      crypto.getRandomValues(new Uint8Array(32)),
    );

    await expect(
      decrypt_aes_gcm_with_fallback(stale_primary, ciphertext, iv),
    ).rejects.toBeDefined();

    await load_account_key_derived_keks_into_memory(
      ACCOUNT_KEY,
      get_account_key_generation(),
    );

    const plaintext = await decrypt_aes_gcm_with_fallback(
      stale_primary,
      ciphertext,
      iv,
    );

    expect(new TextDecoder().decode(plaintext)).toBe('{"theme":"dark"}');
  });

  it("never opens data sealed under another account key", async () => {
    const other = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
    const { ciphertext, iv } = await seal_with_context(
      other,
      "astermail-tags-v1",
      "[]",
    );
    const stale_primary = await import_aes(
      crypto.getRandomValues(new Uint8Array(32)),
    );

    await load_account_key_derived_keks_into_memory(
      ACCOUNT_KEY,
      get_account_key_generation(),
    );

    await expect(
      decrypt_aes_gcm_with_fallback(stale_primary, ciphertext, iv),
    ).rejects.toBeDefined();
  });

  it("refuses to load an account key of the wrong length", async () => {
    await expect(
      load_account_key_derived_keks_into_memory(
        new Uint8Array(16),
        get_account_key_generation(),
      ),
    ).resolves.toBe(false);
    expect(get_legacy_crypto_keys()).toHaveLength(0);
  });

  it("drops a load that finishes after sign-out", async () => {
    const generation = get_account_key_generation();
    const pending = load_account_key_derived_keks_into_memory(
      ACCOUNT_KEY,
      generation,
    );

    clear_account_key_derived_keks();

    await expect(pending).resolves.toBe(false);
    expect(get_legacy_crypto_keys()).toHaveLength(0);
  });

  it("keeps account keys when the vault key list reloads", async () => {
    const { ciphertext, iv } = await seal_with_context(
      ACCOUNT_KEY,
      "astermail-draft-v2",
      "draft",
    );
    const stale_primary = await import_aes(
      crypto.getRandomValues(new Uint8Array(32)),
    );

    await load_account_key_derived_keks_into_memory(
      ACCOUNT_KEY,
      get_account_key_generation(),
    );
    await load_legacy_keks_into_memory(undefined);

    const plaintext = await decrypt_aes_gcm_with_fallback(
      stale_primary,
      ciphertext,
      iv,
    );

    expect(new TextDecoder().decode(plaintext)).toBe("draft");
  });

  it("loads the same account key only once", async () => {
    const generation = get_account_key_generation();

    await load_account_key_derived_keks_into_memory(ACCOUNT_KEY, generation);
    const count = get_legacy_crypto_keys().length;

    await load_account_key_derived_keks_into_memory(ACCOUNT_KEY, generation);

    expect(count).toBe(ACCOUNT_DATA_CONTEXTS.length);
    expect(get_legacy_crypto_keys()).toHaveLength(count);
  });
});
