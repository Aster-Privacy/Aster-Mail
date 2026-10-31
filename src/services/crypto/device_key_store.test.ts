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

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string) => invoke_mock(cmd),
}));

type Handler = ((event: { preventDefault: () => void }) => void) | null;

interface FakeRequest {
  result: unknown;
  error: Error | null;
  onsuccess: Handler;
  onerror: Handler;
  onblocked?: Handler;
  onupgradeneeded?: Handler;
}

const stored = new Map<string, unknown>();
let failing_reads = 0;

function fake_request(): FakeRequest {
  return { result: undefined, error: null, onsuccess: null, onerror: null };
}

function later(fn: () => void): void {
  setTimeout(fn, 0);
}

function fake_transaction() {
  const tx = {
    error: null as Error | null,
    oncomplete: null as (() => void) | null,
    onabort: null as (() => void) | null,
    onerror: null as (() => void) | null,
    pending: 0,
    finish() {
      if (tx.pending === 0) later(() => tx.oncomplete?.());
    },
    objectStore() {
      return {
        get(id: string) {
          const request = fake_request();

          tx.pending += 1;
          later(() => {
            tx.pending -= 1;
            if (failing_reads > 0) {
              failing_reads -= 1;
              request.error = new Error("read failed");
              request.onerror?.({ preventDefault: () => undefined });
              tx.onerror?.();
            } else {
              request.result = stored.get(id);
              request.onsuccess?.({ preventDefault: () => undefined });
            }
            tx.finish();
          });

          return request;
        },
        put(value: unknown, id: string) {
          stored.set(id, value);
        },
        delete(id: string) {
          stored.delete(id);
          tx.finish();
        },
      };
    },
  };

  return tx;
}

function install_fake_indexed_db(): void {
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => fake_transaction(),
    close: () => undefined,
  };

  (globalThis as unknown as Record<string, unknown>).indexedDB = {
    open() {
      const request = fake_request();

      later(() => {
        request.result = db;
        request.onsuccess?.({ preventDefault: () => undefined });
      });

      return request;
    },
    deleteDatabase() {
      const request = fake_request();

      later(() => {
        stored.clear();
        request.onsuccess?.({ preventDefault: () => undefined });
      });

      return request;
    },
  };
}

async function make_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function fail_encrypt_times(count: number) {
  const original = crypto.subtle.encrypt.bind(crypto.subtle);
  let remaining = count;

  return vi
    .spyOn(crypto.subtle, "encrypt")
    .mockImplementation((...args: Parameters<SubtleCrypto["encrypt"]>) => {
      if (remaining > 0) {
        remaining -= 1;

        return Promise.reject(new Error("encrypt failed"));
      }

      return original(...args);
    });
}

beforeEach(() => {
  vi.resetModules();
  stored.clear();
  failing_reads = 0;
  invoke_mock.mockReset();
  invoke_mock.mockResolvedValue(undefined);
  install_fake_indexed_db();
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("device wrap key store", () => {
  it("keeps the stored key when one self-test fails", async () => {
    const existing = await make_key();

    stored.set("device_wrap_key_v2", existing);
    fail_encrypt_times(1);
    const module = await import("./device_key_store");

    await expect(module.get_device_wrap_key()).resolves.toBe(existing);
    expect(stored.get("device_wrap_key_v2")).toBe(existing);
  });

  it("keeps the stored key when one read fails", async () => {
    const existing = await make_key();

    stored.set("device_wrap_key_v2", existing);
    failing_reads = 1;
    const module = await import("./device_key_store");

    await expect(module.get_device_wrap_key()).resolves.toBe(existing);
    expect(stored.get("device_wrap_key_v2")).toBe(existing);
  });

  it("replaces the stored key only when it never works", async () => {
    const existing = await make_key();

    stored.set("device_wrap_key_v2", existing);
    fail_encrypt_times(3);
    const module = await import("./device_key_store");
    const key = await module.get_device_wrap_key();

    expect(key).not.toBeNull();
    expect(key).not.toBe(existing);
    expect(stored.get("device_wrap_key_v2")).toBe(key);
    expect(invoke_mock).not.toHaveBeenCalled();
  });

  it("does not reset the keychain when a new key fails once", async () => {
    fail_encrypt_times(1);
    const module = await import("./device_key_store");
    const key = await module.get_device_wrap_key();

    expect(key).not.toBeNull();
    expect(invoke_mock).not.toHaveBeenCalled();
  });

  it("resets the keychain when a new key never works", async () => {
    fail_encrypt_times(100);
    const module = await import("./device_key_store");

    await expect(module.get_device_wrap_key()).resolves.toBeNull();
    expect(invoke_mock).toHaveBeenCalledWith("reset_webkit_crypto_keychain");
  });
});
