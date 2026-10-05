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
export type RequestPriority = "foreground" | "background";

export const PREEMPT_AFTER_MS = 1500;
export const MAX_IDLE_WAIT_MS = 90_000;
export const MAX_PREEMPTIONS_PER_REQUEST = 5;
export const MIN_BACKGROUND_PAGE_SIZE = 25;
export const MAX_SHRINK_LEVEL = 3;
export const FAST_BACKGROUND_RESPONSE_MS = 4000;

export interface BackgroundRequest {
  controller: AbortController;
  was_preempted: () => boolean;
  settle: (elapsed_ms: number) => void;
  stalled: () => void;
  release: () => void;
}

interface TrackedRequest {
  controller: AbortController;
  preempted: boolean;
}

let foreground_count = 0;
let preempt_timer: ReturnType<typeof setTimeout> | null = null;
let shrink_level = 0;
const idle_waiters = new Set<() => void>();
const tracked_requests = new Set<TrackedRequest>();

function grow_shrink_level(): void {
  shrink_level = Math.min(MAX_SHRINK_LEVEL, shrink_level + 1);
}

function preempt_background_requests(): void {
  preempt_timer = null;

  if (foreground_count === 0 || tracked_requests.size === 0) return;

  grow_shrink_level();

  for (const tracked of Array.from(tracked_requests)) {
    tracked.preempted = true;
    tracked.controller.abort();
  }
}

function release_idle_waiters(): void {
  const waiters = Array.from(idle_waiters);

  idle_waiters.clear();

  for (const resolve of waiters) {
    resolve();
  }
}

export function is_foreground_busy(): boolean {
  return foreground_count > 0;
}

export function begin_foreground_request(): () => void {
  let ended = false;

  foreground_count += 1;

  if (foreground_count === 1 && preempt_timer === null) {
    preempt_timer = setTimeout(preempt_background_requests, PREEMPT_AFTER_MS);
  }

  return () => {
    if (ended) return;
    ended = true;
    foreground_count = Math.max(0, foreground_count - 1);

    if (foreground_count > 0) return;

    if (preempt_timer !== null) {
      clearTimeout(preempt_timer);
      preempt_timer = null;
    }

    release_idle_waiters();
  };
}

export function wait_for_foreground_idle(): Promise<void> {
  if (foreground_count === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      if (timer !== null) clearTimeout(timer);
      idle_waiters.delete(finish);
      resolve();
    };

    timer = setTimeout(finish, MAX_IDLE_WAIT_MS);
    idle_waiters.add(finish);
  });
}

export function track_background_request(): BackgroundRequest {
  const tracked: TrackedRequest = {
    controller: new AbortController(),
    preempted: false,
  };

  tracked_requests.add(tracked);

  return {
    controller: tracked.controller,
    was_preempted: () => tracked.preempted,
    settle: (elapsed_ms: number) => {
      if (elapsed_ms <= FAST_BACKGROUND_RESPONSE_MS && shrink_level > 0) {
        shrink_level -= 1;
      }
    },
    stalled: () => {
      if (!tracked.preempted) grow_shrink_level();
    },
    release: () => {
      tracked_requests.delete(tracked);
    },
  };
}

export function background_page_size(requested: number): number {
  if (shrink_level === 0) return requested;

  const reduced = Math.floor(requested / 2 ** shrink_level);

  return Math.min(requested, Math.max(MIN_BACKGROUND_PAGE_SIZE, reduced));
}

export function reset_request_priority_state(): void {
  foreground_count = 0;
  shrink_level = 0;

  if (preempt_timer !== null) {
    clearTimeout(preempt_timer);
    preempt_timer = null;
  }

  tracked_requests.clear();
  release_idle_waiters();
}
