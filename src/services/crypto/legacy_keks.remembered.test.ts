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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  append_legacy_key_raw_bytes,
  clear_legacy_keks_from_memory,
  decrypt_aes_gcm_with_fallback,
  decrypt_with_legacy_derived_keys,
  decrypt_with_remembered_derived_key,
} from "./legacy_keks";

const KEY_COUNT = 30;
const PURPOSE = new TextEncoder().encode("remembered-key-test");

function raw_key(seed: number): Uint8Array {
  return new Uint8Array(32).map((_, i) => (seed * 31 + i) % 256);
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

async function seal(
  key: CryptoKey,
  text: string,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(text),
    ),
  );

  return { ciphertext, iv };
}

async function derived_key_for(seed: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    raw_key(seed),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return derive_from_base(base);
}

async function raw_aes_key_for(seed: number): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw_key(seed),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

async function wrong_primary(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw_key(999),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

function decode(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

describe("remembered legacy keys", () => {
  beforeEach(async () => {
    clear_legacy_keks_from_memory();
    for (let i = 0; i < KEY_COUNT; i++) {
      await append_legacy_key_raw_bytes(raw_key(i));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clear_legacy_keks_from_memory();
  });

  it("opens derived data through the fallback after one sweep", async () => {
    const key = await derived_key_for(17);
    const first = await seal(key, "first");
    const second = await seal(key, "second");
    const primary = await wrong_primary();

    await expect(
      decrypt_aes_gcm_with_fallback(
        primary,
        first.ciphertext,
        first.iv,
        derive_from_base,
      ),
    ).rejects.toBeDefined();
    expect(
      decode(
        (await decrypt_with_legacy_derived_keys(
          derive_from_base,
          first.ciphertext,
          first.iv,
        )) as ArrayBuffer,
      ),
    ).toBe("first");

    const spy = vi.spyOn(crypto.subtle, "decrypt");
    const opened = await decrypt_aes_gcm_with_fallback(
      primary,
      second.ciphertext,
      second.iv,
      derive_from_base,
    );

    expect(decode(opened)).toBe("second");
    expect(spy.mock.calls.length).toBe(2);
  });

  it("tries the remembered raw key before the rest", async () => {
    const key = await raw_aes_key_for(23);
    const first = await seal(key, "first");
    const second = await seal(key, "second");
    const primary = await wrong_primary();

    expect(
      decode(
        await decrypt_aes_gcm_with_fallback(primary, first.ciphertext, first.iv),
      ),
    ).toBe("first");

    const spy = vi.spyOn(crypto.subtle, "decrypt");

    expect(
      decode(
        await decrypt_aes_gcm_with_fallback(
          primary,
          second.ciphertext,
          second.iv,
        ),
      ),
    ).toBe("second");
    expect(spy.mock.calls.length).toBe(2);
  });

  it("keeps the derived sweep working when the remembered key is wrong", async () => {
    const first = await seal(await derived_key_for(4), "first");
    const second = await seal(await derived_key_for(9), "second");

    await decrypt_with_legacy_derived_keys(
      derive_from_base,
      first.ciphertext,
      first.iv,
    );

    expect(
      await decrypt_with_remembered_derived_key(
        derive_from_base,
        second.ciphertext,
        second.iv,
      ),
    ).toBeNull();
    expect(
      decode(
        (await decrypt_with_legacy_derived_keys(
          derive_from_base,
          second.ciphertext,
          second.iv,
        )) as ArrayBuffer,
      ),
    ).toBe("second");
  });

  it("rejects with the primary error when no key opens the data", async () => {
    const stray = await seal(await raw_aes_key_for(500), "stray");
    const primary = await wrong_primary();

    await expect(
      decrypt_aes_gcm_with_fallback(
        primary,
        stray.ciphertext,
        stray.iv,
        derive_from_base,
      ),
    ).rejects.toBeDefined();
  });

  it("forgets remembered keys when legacy keys are cleared", async () => {
    const key = await derived_key_for(11);
    const first = await seal(key, "first");

    await decrypt_with_legacy_derived_keys(
      derive_from_base,
      first.ciphertext,
      first.iv,
    );
    clear_legacy_keks_from_memory();

    expect(
      await decrypt_with_remembered_derived_key(
        derive_from_base,
        first.ciphertext,
        first.iv,
      ),
    ).toBeNull();
  });
});
