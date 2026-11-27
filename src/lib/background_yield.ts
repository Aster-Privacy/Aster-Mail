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
import { DEFAULT_SLICE_BUDGET_MS, type TimeSlicer } from "@/lib/scheduling";

export const INPUT_QUIET_MS = 300;

const INPUT_EVENTS = [
  "pointerdown",
  "keydown",
  "scroll",
  "wheel",
  "touchstart",
] as const;

interface SchedulerWithPostTask {
  postTask?: (
    callback: () => void,
    options?: { priority?: "user-blocking" | "user-visible" | "background" },
  ) => Promise<unknown>;
}

let last_input_at = Number.NEGATIVE_INFINITY;
let input_listening = false;

function background_clock(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function note_input(): void {
  last_input_at = background_clock();
}

function ensure_input_listeners(): void {
  if (input_listening) return;
  if (typeof window === "undefined" || !window.addEventListener) return;

  input_listening = true;

  for (const name of INPUT_EVENTS) {
    window.addEventListener(name, note_input, { capture: true, passive: true });
  }
}

export function ms_since_user_input(): number {
  ensure_input_listeners();

  return background_clock() - last_input_at;
}

export function is_user_interacting(): boolean {
  return ms_since_user_input() < INPUT_QUIET_MS;
}

function post_background_task(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerWithPostTask })
    .scheduler;

  if (typeof scheduler?.postTask === "function") {
    return scheduler
      .postTask(() => undefined, { priority: "background" })
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function wait_ms(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function yield_to_background(
  max_wait_ms: number = Number.POSITIVE_INFINITY,
): Promise<void> {
  ensure_input_listeners();

  const deadline = background_clock() + max_wait_ms;

  await post_background_task();

  for (;;) {
    const quiet_for = ms_since_user_input();

    if (quiet_for >= INPUT_QUIET_MS) return;

    const left = deadline - background_clock();

    if (left <= 0) return;

    await wait_ms(Math.max(1, Math.min(INPUT_QUIET_MS - quiet_for, left)));
    await post_background_task();
  }
}

export function create_background_slicer(
  budget_ms: number = DEFAULT_SLICE_BUDGET_MS,
  max_wait_ms: () => number = () => Number.POSITIVE_INFINITY,
): TimeSlicer {
  let slice_started_at = background_clock();

  ensure_input_listeners();

  return {
    should_yield: () =>
      background_clock() - slice_started_at >= budget_ms ||
      is_user_interacting(),
    yield: async () => {
      await yield_to_background(max_wait_ms());
      slice_started_at = background_clock();
    },
  };
}
