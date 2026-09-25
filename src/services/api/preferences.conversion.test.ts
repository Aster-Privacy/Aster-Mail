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
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const h = vi.hoisted(() => ({
  write_key: null as CryptoKey | null,
  stored: null as Record<string, unknown> | null,
  get_calls: 0,
  put_calls: [] as Record<string, unknown>[],
  put_response: { data: { success: true } } as Record<string, unknown>,
}));

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(async () => {
      h.get_calls++;

      return h.stored ? { data: h.stored } : { error: "offline" };
    }),
    put: vi.fn(async (_url: string, body: Record<string, unknown>) => {
      h.put_calls.push(body);

      return h.put_response;
    }),
  },
}));

vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: async () => h.write_key,
  retry_after_account_key_load: <T>(attempt: () => Promise<T>) => attempt(),
}));

import {
  convert_preferences_to_account_key,
  derive_preferences_key_raw,
} from "./preferences";

import { array_to_base64, base64_to_array } from "@/services/crypto/envelope";

const IDENTITY_KEY = "identity-key-armored";
const vault = { identity_key: IDENTITY_KEY } as unknown as Parameters<
  typeof convert_preferences_to_account_key
>[0];
const PLAINTEXT = JSON.stringify({ theme: "dark", time_format: "24h" });

let write_key: CryptoKey;
let legacy_key: CryptoKey;

async function seal(key: CryptoKey, text: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(text),
  );

  return {
    encrypted_preferences: array_to_base64(new Uint8Array(ciphertext)),
    preferences_nonce: array_to_base64(nonce),
  };
}

async function open(key: CryptoKey, body: Record<string, unknown>) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64_to_array(body.preferences_nonce as string),
    },
    key,
    base64_to_array(body.encrypted_preferences as string),
  );

  return new TextDecoder().decode(plaintext);
}

beforeAll(async () => {
  write_key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  legacy_key = await crypto.subtle.importKey(
    "raw",
    await derive_preferences_key_raw(IDENTITY_KEY),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
});

beforeEach(() => {
  h.write_key = write_key;
  h.stored = null;
  h.get_calls = 0;
  h.put_calls = [];
  h.put_response = { data: { success: true } };
});

describe("convert_preferences_to_account_key", () => {
  it("does nothing without an account write key", async () => {
    h.write_key = null;

    expect(await convert_preferences_to_account_key(vault)).toBe("unavailable");
    expect(h.get_calls).toBe(0);
  });

  it("reports a failed read without writing", async () => {
    expect(await convert_preferences_to_account_key(vault)).toBe("failed");
    expect(h.put_calls).toEqual([]);
  });

  it("reports missing preferences", async () => {
    h.stored = {
      encrypted_preferences: "",
      preferences_nonce: "",
      preferences_version: 0,
    };

    expect(await convert_preferences_to_account_key(vault)).toBe("not_found");
    expect(h.put_calls).toEqual([]);
  });

  it("refuses to write when the server has no version to compare", async () => {
    h.stored = await seal(legacy_key, PLAINTEXT);

    expect(await convert_preferences_to_account_key(vault)).toBe("unavailable");
    expect(h.put_calls).toEqual([]);
  });

  it("leaves preferences that already use the account key alone", async () => {
    h.stored = {
      ...(await seal(write_key, PLAINTEXT)),
      preferences_version: 4,
    };

    expect(await convert_preferences_to_account_key(vault)).toBe(
      "already_converted",
    );
    expect(h.put_calls).toEqual([]);
  });

  it("reseals legacy preferences with the exact bytes and the stored version", async () => {
    h.stored = {
      ...(await seal(legacy_key, PLAINTEXT)),
      preferences_version: 7,
    };

    expect(await convert_preferences_to_account_key(vault)).toBe("converted");
    expect(h.put_calls).toHaveLength(1);
    expect(h.put_calls[0].expected_version).toBe(7);
    expect(await open(write_key, h.put_calls[0])).toBe(PLAINTEXT);
    expect(h.put_calls[0].preferences_nonce).not.toBe(
      h.stored.preferences_nonce,
    );
  });

  it("reports a version conflict from a concurrent save", async () => {
    h.stored = {
      ...(await seal(legacy_key, PLAINTEXT)),
      preferences_version: 7,
    };
    h.put_response = {
      error: "conflict",
      server_code: "PREFERENCES_VERSION_CONFLICT",
    };

    expect(await convert_preferences_to_account_key(vault)).toBe("conflict");
  });

  it("never writes preferences it cannot open", async () => {
    const stranger = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    h.stored = { ...(await seal(stranger, PLAINTEXT)), preferences_version: 1 };

    expect(await convert_preferences_to_account_key(vault)).toBe("failed");
    expect(h.put_calls).toEqual([]);
  });

  it("never writes a payload that is not a preferences object", async () => {
    h.stored = {
      ...(await seal(legacy_key, "[1,2,3]")),
      preferences_version: 1,
    };

    expect(await convert_preferences_to_account_key(vault)).toBe("failed");
    expect(h.put_calls).toEqual([]);
  });
});
