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
  fallback_key_server_id,
  get_fallback_key_set_epoch,
  get_unopenable_fallback_count,
} from "./legacy_keks";
import { server_known_kek_id } from "./server_known_keys";

const KEY_COUNT = 6;
const OPENING_INDEX = 4;

function raw_key(seed: number): Uint8Array {
  return new Uint8Array(32).map((_, i) => (seed * 17 + i * 5 + 1) % 256);
}

async function aes_key(seed: number, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw_key(seed),
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

async function seal(
  seed: number,
  text: string,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aes_key(seed, "encrypt"),
      new TextEncoder().encode(text),
    ),
  );

  return { ciphertext, iv };
}

function record_keys(): { ids: (string | null)[]; stop: () => void } {
  const original = crypto.subtle.decrypt.bind(crypto.subtle);
  const ids: (string | null)[] = [];
  const spy = vi
    .spyOn(crypto.subtle, "decrypt")
    .mockImplementation(((
      algorithm: AlgorithmIdentifier,
      key: CryptoKey,
      data: BufferSource,
    ) => {
      ids.push(fallback_key_server_id(key));

      return original(algorithm, key, data);
    }) as typeof crypto.subtle.decrypt);

  return { ids, stop: () => spy.mockRestore() };
}

describe("legacy fallback key trial", () => {
  let primary: CryptoKey;

  beforeEach(async () => {
    clear_legacy_keks_from_memory();
    for (let seed = 0; seed < KEY_COUNT; seed += 1) {
      await append_legacy_key_raw_bytes(raw_key(seed));
    }
    primary = await aes_key(999, "decrypt");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clear_legacy_keks_from_memory();
  });

  it("tries keys one at a time and stops at the first that opens", async () => {
    const sealed = await seal(OPENING_INDEX, "hello");
    const log = record_keys();

    try {
      const opened = await decrypt_aes_gcm_with_fallback(
        primary,
        sealed.ciphertext,
        sealed.iv,
      );

      expect(new TextDecoder().decode(opened)).toBe("hello");
    } finally {
      log.stop();
    }

    expect(log.ids.length).toBe(1 + OPENING_INDEX + 1);
    expect(log.ids.at(-1)).toBe(server_known_kek_id(raw_key(OPENING_INDEX)));
  });

  it("tries the key that opened earlier envelopes first", async () => {
    const first = await seal(OPENING_INDEX, "first");
    const second = await seal(OPENING_INDEX, "second");

    await decrypt_aes_gcm_with_fallback(primary, first.ciphertext, first.iv);

    const log = record_keys();

    try {
      await decrypt_aes_gcm_with_fallback(primary, second.ciphertext, second.iv);
    } finally {
      log.stop();
    }

    expect(log.ids).toEqual([
      null,
      server_known_kek_id(raw_key(OPENING_INDEX)),
    ]);
  });

  it("remembers an unopenable envelope until the key set changes", async () => {
    const sealed = await seal(77, "late");
    const first = record_keys();

    try {
      await expect(
        decrypt_aes_gcm_with_fallback(primary, sealed.ciphertext, sealed.iv),
      ).rejects.toBeDefined();
    } finally {
      first.stop();
    }

    const fallback_ids = first.ids.filter((id) => id !== null);

    expect(fallback_ids.length).toBe(KEY_COUNT);
    expect(new Set(fallback_ids).size).toBe(KEY_COUNT);
    expect(get_unopenable_fallback_count()).toBe(1);

    const repeat = record_keys();

    try {
      await expect(
        decrypt_aes_gcm_with_fallback(primary, sealed.ciphertext, sealed.iv),
      ).rejects.toBeDefined();
    } finally {
      repeat.stop();
    }

    expect(repeat.ids).toEqual([null]);

    const epoch = get_fallback_key_set_epoch();

    await append_legacy_key_raw_bytes(raw_key(77));

    expect(get_fallback_key_set_epoch()).toBeGreaterThan(epoch);
    expect(get_unopenable_fallback_count()).toBe(0);
    expect(
      new TextDecoder().decode(
        await decrypt_aes_gcm_with_fallback(
          primary,
          sealed.ciphertext,
          sealed.iv,
        ),
      ),
    ).toBe("late");
  });

  it("clears remembered failures when the vault keys are cleared", async () => {
    const sealed = await seal(88, "gone");

    await expect(
      decrypt_aes_gcm_with_fallback(primary, sealed.ciphertext, sealed.iv),
    ).rejects.toBeDefined();
    expect(get_unopenable_fallback_count()).toBe(1);

    clear_legacy_keks_from_memory();

    expect(get_unopenable_fallback_count()).toBe(0);
  });
});
