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
import { describe, expect, it, vi } from "vitest";

import {
  batch_retry_after_ms,
  process_batches,
  RATE_LIMIT_RETRY_MS,
} from "./batch_processor";

function ids_of(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `id-${i}`);
}

describe("process_batches retries", () => {
  it("keeps every id when the server rate limits part of a large job", async () => {
    const ids = ids_of(8_000);
    const applied: string[] = [];
    let call = 0;

    const result = await process_batches({
      ids,
      batch_size: 100,
      retry_base_delay_ms: 0,
      process_batch: async (batch) => {
        call += 1;

        if (call % 3 === 0) {
          return { ok: false, retry_after_ms: 0 };
        }

        applied.push(...batch);

        return true;
      },
    });

    expect(result.succeeded).toBe(8_000);
    expect(result.failed).toBe(0);
    expect(result.failed_ids).toEqual([]);
    expect(new Set(applied).size).toBe(8_000);
  });

  it("retries a batch until it succeeds", async () => {
    let attempts = 0;

    const result = await process_batches({
      ids: ids_of(10),
      batch_size: 10,
      retry_base_delay_ms: 0,
      process_batch: async () => {
        attempts += 1;

        return attempts >= 3;
      },
    });

    expect(attempts).toBe(3);
    expect(result.succeeded).toBe(10);
    expect(result.failed_ids).toEqual([]);
  });

  it("gives up after the attempt budget and reports the ids that failed", async () => {
    const result = await process_batches({
      ids: ids_of(200),
      batch_size: 100,
      max_attempts: 2,
      retry_base_delay_ms: 0,
      process_batch: async (batch) => batch[0] !== "id-0",
    });

    expect(result.succeeded).toBe(100);
    expect(result.failed).toBe(100);
    expect(result.failed_ids).toHaveLength(100);
    expect(result.failed_ids[0]).toBe("id-0");
  });

  it("retries a batch that throws", async () => {
    let attempts = 0;

    const result = await process_batches({
      ids: ids_of(5),
      batch_size: 5,
      retry_base_delay_ms: 0,
      process_batch: async () => {
        attempts += 1;

        if (attempts === 1) throw new Error("network");

        return true;
      },
    });

    expect(result.succeeded).toBe(5);
    expect(result.failed_ids).toEqual([]);
  });

  it("stops retrying once the caller aborts", async () => {
    const controller = new AbortController();
    const process_batch = vi.fn(async () => {
      controller.abort();

      return false;
    });

    const result = await process_batches({
      ids: ids_of(100),
      batch_size: 100,
      retry_base_delay_ms: 0,
      signal: controller.signal,
      process_batch,
    });

    expect(process_batch).toHaveBeenCalledTimes(1);
    expect(result.was_cancelled).toBe(true);
    expect(result.failed_ids).toHaveLength(100);
  });

  it("waits out a rate limit before retrying", () => {
    expect(batch_retry_after_ms({ code: "RATE_LIMIT_EXCEEDED" })).toBe(
      RATE_LIMIT_RETRY_MS,
    );
    expect(batch_retry_after_ms({ code: "SERVER_ERROR" })).toBeUndefined();
    expect(batch_retry_after_ms({})).toBeUndefined();
  });
});
