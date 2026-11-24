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

type ReadinessModule = typeof import("@/services/crypto/decrypt_readiness");

let readiness: ReadinessModule;
let keys_settled = true;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  keys_settled = true;
  readiness = await import("@/services/crypto/decrypt_readiness");
  readiness.register_keys_settled_probe(() => keys_settled);
});

afterEach(() => {
  vi.useRealTimers();
});

function collect_retries(): string[][] {
  const seen: string[][] = [];

  readiness.on_pending_decrypt_retry((ids) => {
    seen.push([...ids].sort());
  });

  return seen;
}

describe("decrypt readiness", () => {
  it("treats a failure with settled keys and no transient error as final", () => {
    const before = readiness.capture_decrypt_readiness();

    expect(readiness.settle_decrypt_failure("m1", before)).toBe("failed");
    expect(readiness.is_decrypt_pending("m1")).toBe(false);
  });

  it("keeps an attempt pending while the keys are not settled", () => {
    keys_settled = false;
    const before = readiness.capture_decrypt_readiness();

    expect(readiness.settle_decrypt_failure("m1", before)).toBe("pending");
    expect(readiness.is_decrypt_pending("m1")).toBe(true);
  });

  it("keeps an attempt pending when the keys changed during it", () => {
    const before = readiness.capture_decrypt_readiness();

    readiness.note_decrypt_key_change();

    expect(readiness.settle_decrypt_failure("m1", before)).toBe("pending");
  });

  it("keeps an attempt pending when a transient error happened during it", () => {
    const before = readiness.capture_decrypt_readiness();

    readiness.note_transient_failure();

    expect(readiness.settle_decrypt_failure("m1", before)).toBe("pending");
  });

  it("classifies abort, timeout, network and escrow errors as transient", () => {
    const named = (name: string) => Object.assign(new Error(name), { name });

    expect(readiness.is_transient_decrypt_error(named("AbortError"))).toBe(
      true,
    );
    expect(readiness.is_transient_decrypt_error(named("TimeoutError"))).toBe(
      true,
    );
    expect(
      readiness.is_transient_decrypt_error(named("EscrowUnavailableError")),
    ).toBe(true);
    expect(
      readiness.is_transient_decrypt_error(new TypeError("Failed to fetch")),
    ).toBe(true);
    expect(readiness.is_transient_decrypt_error(named("OperationError"))).toBe(
      false,
    );
    expect(readiness.is_transient_decrypt_error(new Error("bad tag"))).toBe(
      false,
    );
  });

  it("retries pending items once the keys become ready", async () => {
    const seen = collect_retries();

    keys_settled = false;
    readiness.settle_decrypt_failure(
      "m1",
      readiness.capture_decrypt_readiness(),
    );
    await vi.advanceTimersByTimeAsync(120_000);
    expect(seen).toEqual([]);

    keys_settled = true;
    readiness.note_decrypt_key_change();
    await vi.advanceTimersByTimeAsync(0);

    expect(seen).toEqual([["m1"]]);
  });

  it("backs off between retries after transient failures", async () => {
    const seen = collect_retries();
    const fail_transiently = () => {
      const before = readiness.capture_decrypt_readiness();

      readiness.note_transient_failure();
      readiness.settle_decrypt_failure("m1", before);
    };
    const fired_at: number[] = [];

    readiness.on_pending_decrypt_retry(() => {
      fired_at.push(Date.now());
      fail_transiently();
    });

    const start = Date.now();

    fail_transiently();
    await vi.advanceTimersByTimeAsync(
      400 + 2000 + 6000 + 15000 + 30000 + 60000 + 60000,
    );

    expect(fired_at.map((at) => at - start)).toEqual([
      400, 2400, 8400, 23400, 53400, 113400, 173400,
    ]);
    expect(seen.length).toBe(fired_at.length);
  });

  it("stops retrying once the pending item decrypts", async () => {
    const seen = collect_retries();
    const before = readiness.capture_decrypt_readiness();

    readiness.note_transient_failure();
    readiness.settle_decrypt_failure("m1", before);
    readiness.settle_decrypt_success("m1");
    await vi.advanceTimersByTimeAsync(120_000);

    expect(seen).toEqual([]);
    expect(readiness.is_decrypt_pending("m1")).toBe(false);
  });
});
