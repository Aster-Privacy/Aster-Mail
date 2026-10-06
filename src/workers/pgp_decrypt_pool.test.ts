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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/crypto/key_manager_pgp", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/key_manager_pgp")
  >()),
  decrypt_message_with_any_key: vi.fn(),
}));

import { decrypt_message_with_any_key } from "@/services/crypto/key_manager_pgp";

class fake_worker {
  static instances: fake_worker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  constructor() {
    fake_worker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }
}

async function load_pool() {
  vi.resetModules();

  return import("./pgp_decrypt_pool");
}

describe("decrypt_pgp_message_parallel", () => {
  beforeEach(() => {
    fake_worker.instances = [];
    vi.stubGlobal("Worker", fake_worker);
    vi.stubGlobal("navigator", { hardwareConcurrency: 2 });
    vi.mocked(decrypt_message_with_any_key).mockReset();
    vi.mocked(decrypt_message_with_any_key).mockResolvedValue("fallback");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("resolves with the worker plaintext", async () => {
    const { decrypt_pgp_message_parallel } = await load_pool();
    const promise = decrypt_pgp_message_parallel("cipher", ["key"], "pass");
    const worker = fake_worker.instances[0];
    const request = worker.posted[0] as { id: number };

    worker.onmessage?.({
      data: { id: request.id, plaintext: "hello" },
    } as MessageEvent);

    await expect(promise).resolves.toBe("hello");
    expect(decrypt_message_with_any_key).not.toHaveBeenCalled();
  });

  it("rejects without an in-thread retry when the worker cannot decrypt", async () => {
    const { decrypt_pgp_message_parallel } = await load_pool();
    const promise = decrypt_pgp_message_parallel("cipher", ["key"], "pass");
    const worker = fake_worker.instances[0];
    const request = worker.posted[0] as { id: number };

    worker.onmessage?.({
      data: { id: request.id, error: "decrypt_failed" },
    } as MessageEvent);

    await expect(promise).rejects.toThrow("decrypt_failed");
    expect(decrypt_message_with_any_key).not.toHaveBeenCalled();
  });

  it("falls back in-thread and tears down the pool on worker error", async () => {
    const { decrypt_pgp_message_parallel } = await load_pool();
    const first = decrypt_pgp_message_parallel("cipher", ["key"], "pass");
    const worker = fake_worker.instances[0];

    worker.onerror?.({ message: "boom" } as ErrorEvent);

    await expect(first).resolves.toBe("fallback");
    expect(fake_worker.instances.every((w) => w.terminated)).toBe(true);

    const created_before = fake_worker.instances.length;

    await expect(
      decrypt_pgp_message_parallel("cipher", ["key"], "pass"),
    ).resolves.toBe("fallback");
    expect(fake_worker.instances.length).toBe(created_before);
    expect(decrypt_message_with_any_key).toHaveBeenCalledTimes(2);
  });

  it("falls back in-thread on messageerror", async () => {
    const { decrypt_pgp_message_parallel } = await load_pool();
    const promise = decrypt_pgp_message_parallel("cipher", ["key"], "pass");
    const worker = fake_worker.instances[0];

    worker.onmessageerror?.({ data: null } as MessageEvent);

    await expect(promise).resolves.toBe("fallback");
  });

  it("falls back in-thread when the worker never replies", async () => {
    vi.useFakeTimers();

    const { decrypt_pgp_message_parallel } = await load_pool();
    const promise = decrypt_pgp_message_parallel("cipher", ["key"], "pass");

    await vi.advanceTimersByTimeAsync(60_000);

    await expect(promise).resolves.toBe("fallback");
    expect(decrypt_message_with_any_key).toHaveBeenCalledTimes(1);
  });

  it("terminates every worker and drops pending work when the vault is cleared", async () => {
    const { decrypt_pgp_message_parallel } = await load_pool();
    const { clear_vault_from_memory } = await import(
      "@/services/crypto/memory_key_store"
    );
    const pending = decrypt_pgp_message_parallel("cipher", ["key"], "pass");
    const before = [...fake_worker.instances];

    expect(before.length).toBe(2);

    clear_vault_from_memory();

    await expect(pending).rejects.toThrow("vault was cleared");
    expect(before.every((w) => w.terminated)).toBe(true);
    expect(before.every((w) => w.onmessage === null)).toBe(true);
    expect(decrypt_message_with_any_key).not.toHaveBeenCalled();
  });

  it("terminates the workers when the vault is cleared for the same owner", async () => {
    const { decrypt_pgp_message_parallel } = await load_pool();
    const { clear_vault_from_memory } = await import(
      "@/services/crypto/memory_key_store"
    );

    void decrypt_pgp_message_parallel("cipher", ["key"], "pass").catch(
      () => undefined,
    );

    const before = [...fake_worker.instances];

    clear_vault_from_memory({ keep_account_keys: true });

    expect(before.every((w) => w.terminated)).toBe(true);
  });

  it("starts fresh workers for the next unlock after a vault clear", async () => {
    const { decrypt_pgp_message_parallel } = await load_pool();
    const { clear_vault_from_memory } = await import(
      "@/services/crypto/memory_key_store"
    );

    void decrypt_pgp_message_parallel("cipher", ["key"], "pass").catch(
      () => undefined,
    );

    const before = [...fake_worker.instances];

    clear_vault_from_memory();

    const promise = decrypt_pgp_message_parallel("cipher", ["key"], "pass");
    const fresh = fake_worker.instances.filter((w) => !before.includes(w));

    expect(fresh.length).toBe(2);
    expect(fresh.every((w) => !w.terminated)).toBe(true);

    const request = fresh[0].posted[0] as { id: number };

    fresh[0].onmessage?.({
      data: { id: request.id, plaintext: "hello" },
    } as MessageEvent);

    await expect(promise).resolves.toBe("hello");
  });
});
