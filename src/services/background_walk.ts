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

import { is_page_hidden } from "@/lib/scheduling";
import { safe_local_get, safe_local_set } from "@/lib/safe_storage";

export const WALK_PAGE_PAUSE_MS = 3_000;
export const WALK_IDLE_TIMEOUT_MS = 5_000;

const WALK_MARKER_PREFIX = "aster_walk_done:";
const WALK_LOCK_PREFIX = "aster_walk:";

interface LockManagerLike {
  request: (
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<unknown>,
  ) => Promise<unknown>;
}

export interface SingleTabResult<T> {
  ran: boolean;
  value?: T;
}

function lock_manager(): LockManagerLike | null {
  if (typeof navigator === "undefined") return null;

  const locks = (navigator as unknown as { locks?: LockManagerLike }).locks;

  return locks && typeof locks.request === "function" ? locks : null;
}

export async function run_in_single_tab<T>(
  name: string,
  task: () => Promise<T>,
): Promise<SingleTabResult<T>> {
  const locks = lock_manager();

  if (!locks) return { ran: true, value: await task() };

  let result: SingleTabResult<T> = { ran: false };

  await locks.request(
    WALK_LOCK_PREFIX + name,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return;

      result = { ran: true, value: await task() };
    },
  );

  return result;
}

export function wait_until_visible(signal?: AbortSignal): Promise<void> {
  if (!is_page_hidden() || signal?.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const finish = () => {
      document.removeEventListener("visibilitychange", on_change);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const on_change = () => {
      if (!is_page_hidden()) finish();
    };

    document.addEventListener("visibilitychange", on_change);
    signal?.addEventListener("abort", finish);
  });
}

function wait_for_idle(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: WALK_IDLE_TIMEOUT_MS });

      return;
    }

    setTimeout(resolve, 0);
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);

    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }

    signal?.addEventListener("abort", done);
  });
}

export async function pace_walk_page(
  pause_ms: number = WALK_PAGE_PAUSE_MS,
  signal?: AbortSignal,
): Promise<void> {
  await sleep(pause_ms, signal);
  await wait_until_visible(signal);
  if (signal?.aborted) return;
  await wait_for_idle();
}

function marker_key(name: string, version: number, account_id: string) {
  return `${WALK_MARKER_PREFIX}${name}:v${version}:${account_id}`;
}

export function has_walk_marker(
  name: string,
  version: number,
  account_id: string,
): boolean {
  return safe_local_get(marker_key(name, version, account_id)) !== null;
}

export function set_walk_marker(
  name: string,
  version: number,
  account_id: string,
): void {
  safe_local_set(marker_key(name, version, account_id), String(Date.now()));
}
