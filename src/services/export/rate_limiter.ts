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
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 32000;

export class ExportRateLimiter {
  private tokens: number;
  private last_refill = Date.now();
  private consecutive_429 = 0;

  constructor(
    private rate_per_sec: number = 8,
    private burst: number = 16,
  ) {
    this.tokens = burst;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.last_refill) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate_per_sec);
    this.last_refill = now;
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const wait_ms = Math.ceil(((1 - this.tokens) / this.rate_per_sec) * 1000);
    await sleep(wait_ms, signal);
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  async backoff_after_429(signal?: AbortSignal): Promise<void> {
    this.consecutive_429++;
    const base = Math.min(
      MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * Math.pow(2, this.consecutive_429 - 1),
    );
    const jittered = base * (0.5 + Math.random() * 0.5);
    await sleep(jittered, signal);
  }

  reset_backoff(): void {
    this.consecutive_429 = 0;
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", on_abort);
      resolve();
    }, ms);
    const on_abort = () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", on_abort, { once: true });
  });
}
