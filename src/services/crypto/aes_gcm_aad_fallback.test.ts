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
import { afterEach, describe, it, expect, vi } from "vitest";

import {
  decrypt_aes_gcm_bound_or_unbound,
  local_unbound_policy,
} from "./aes_gcm_aad_fallback";

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

    const opened = await decrypt_aes_gcm_bound_or_unbound(
      key,
      iv,
      sealed,
      aad,
      "accept_unbound",
    );

    expect(new Uint8Array(opened)).toEqual(plaintext);
  });

  it("opens ciphertext sealed without additional data", async () => {
    const key = await make_key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(key, iv);

    const opened = await decrypt_aes_gcm_bound_or_unbound(
      key,
      iv,
      sealed,
      aad,
      "accept_unbound",
    );

    expect(new Uint8Array(opened)).toEqual(plaintext);
  });

  it("rejects ciphertext bound to different additional data", async () => {
    const key = await make_key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(key, iv, new TextEncoder().encode("other"));

    await expect(
      decrypt_aes_gcm_bound_or_unbound(key, iv, sealed, aad, "accept_unbound"),
    ).rejects.toThrow();
  });

  it("rejects ciphertext sealed under another key", async () => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(await make_key(), iv, aad);

    await expect(
      decrypt_aes_gcm_bound_or_unbound(
        await make_key(),
        iv,
        sealed,
        aad,
        "accept_unbound",
      ),
    ).rejects.toThrow();
  });

  it("refuses ciphertext sealed without additional data when told to", async () => {
    const key = await make_key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(key, iv);

    await expect(
      decrypt_aes_gcm_bound_or_unbound(key, iv, sealed, aad, "refuse_unbound"),
    ).rejects.toThrow();
  });

  it("still opens bound ciphertext when unbound data is refused", async () => {
    const key = await make_key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await seal(key, iv, aad);

    const opened = await decrypt_aes_gcm_bound_or_unbound(
      key,
      iv,
      sealed,
      aad,
      "refuse_unbound",
    );

    expect(new Uint8Array(opened)).toEqual(plaintext);
  });
});

describe("local_unbound_policy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses unbound data in a browser", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });

    expect(local_unbound_policy()).toBe("refuse_unbound");
  });

  it("refuses unbound data in the desktop app on other systems", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });

    expect(local_unbound_policy()).toBe("refuse_unbound");
  });

  it("accepts unbound data only in the Mac desktop app", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });

    expect(local_unbound_policy()).toBe("accept_unbound");
  });
});
