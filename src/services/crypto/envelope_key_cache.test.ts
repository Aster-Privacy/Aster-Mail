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
  with_cached_envelope_key,
  clear_envelope_key_cache,
} from "./envelope_key_cache";
import {
  encrypt_envelope,
  decrypt_envelope,
  derive_envelope_key_from_bytes,
} from "./envelope";

async function fake_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

describe("envelope key cache", () => {
  beforeEach(() => {
    clear_envelope_key_cache();
  });

  it("derives once for a repeated cache id", async () => {
    let derives = 0;
    const derive = () => {
      derives += 1;

      return fake_key();
    };

    const first = await with_cached_envelope_key("id-a", derive);
    const second = await with_cached_envelope_key("id-a", derive);

    expect(second).toBe(first);
    expect(derives).toBe(1);
  });

  it("shares one derivation across concurrent callers", async () => {
    let derives = 0;
    const derive = () => {
      derives += 1;

      return fake_key();
    };

    const results = await Promise.all([
      with_cached_envelope_key("id-b", derive),
      with_cached_envelope_key("id-b", derive),
      with_cached_envelope_key("id-b", derive),
    ]);

    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
    expect(derives).toBe(1);
  });

  it("keeps distinct cache ids apart", async () => {
    const a = await with_cached_envelope_key("id-c", fake_key);
    const b = await with_cached_envelope_key("id-d", fake_key);

    expect(b).not.toBe(a);
  });

  it("does not cache a failed derivation", async () => {
    let attempts = 0;
    const derive = () => {
      attempts += 1;

      if (attempts === 1) return Promise.reject(new Error("derive failed"));

      return fake_key();
    };

    await expect(with_cached_envelope_key("id-e", derive)).rejects.toThrow(
      "derive failed",
    );

    const recovered = await with_cached_envelope_key("id-e", derive);

    expect(recovered).toBeDefined();
    expect(attempts).toBe(2);
  });

  it("evicts the oldest entry past the bound", async () => {
    const ids = Array.from({ length: 520 }, (_, i) => `bulk-${i}`);

    for (const id of ids) {
      await with_cached_envelope_key(id, fake_key);
    }

    let re_derives = 0;
    const counting = () => {
      re_derives += 1;

      return fake_key();
    };

    await with_cached_envelope_key("bulk-0", counting);

    expect(re_derives).toBe(1);
  });

  it("returns the same derived key object for the same passphrase and salt", async () => {
    const passphrase_bytes = new TextEncoder().encode("envelope-pw");
    const salt = new Uint8Array(16).fill(7);

    const first = await derive_envelope_key_from_bytes(passphrase_bytes, salt);
    const second = await derive_envelope_key_from_bytes(passphrase_bytes, salt);

    expect(second).toBe(first);
  });

  it("still round-trips an envelope with the cache warm", async () => {
    const payload = { subject: "cached", body: "still works" };
    const { encrypted } = await encrypt_envelope(payload, "envelope-pw");

    expect(await decrypt_envelope(encrypted, "envelope-pw")).toEqual(payload);
    expect(await decrypt_envelope(encrypted, "envelope-pw")).toEqual(payload);
    expect(await decrypt_envelope(encrypted, "wrong-pw")).toBeNull();
  });
});
