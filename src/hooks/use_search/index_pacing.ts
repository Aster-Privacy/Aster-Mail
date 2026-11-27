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

import { is_page_hidden, yield_to_visible_page } from "@/lib/scheduling";

export const INPUT_QUIET_MS = 450;
export const INPUT_MAX_WAIT_MS = 3000;

const INPUT_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;

interface PacingConfig {
  enabled: boolean;
  quiet_ms: number;
  max_wait_ms: number;
}

const config: PacingConfig = {
  enabled: true,
  quiet_ms: INPUT_QUIET_MS,
  max_wait_ms: INPUT_MAX_WAIT_MS,
};
let last_input_at = Number.NEGATIVE_INFINITY;
let listening = false;

function note_input(): void {
  last_input_at = performance.now();
}

function ensure_input_listeners(): void {
  if (listening || typeof window === "undefined") return;

  listening = true;

  for (const name of INPUT_EVENTS) {
    window.addEventListener(name, note_input, { capture: true, passive: true });
  }
}

export function configure_index_pacing(next: Partial<PacingConfig>): void {
  Object.assign(config, next);
}

export function index_input_max_wait_ms(): number {
  return config.max_wait_ms;
}

export function reset_index_pacing(): void {
  config.enabled = true;
  config.quiet_ms = INPUT_QUIET_MS;
  config.max_wait_ms = INPUT_MAX_WAIT_MS;
  last_input_at = Number.NEGATIVE_INFINITY;
}

export function input_quiet_remaining_ms(now = performance.now()): number {
  if (!config.enabled || is_page_hidden()) return 0;

  return Math.max(0, last_input_at + config.quiet_ms - now);
}

export async function wait_for_input_idle(): Promise<void> {
  ensure_input_listeners();

  const deadline = performance.now() + config.max_wait_ms;
  let remaining = input_quiet_remaining_ms();

  while (remaining > 0) {
    const left = deadline - performance.now();

    if (left <= 0) return;

    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(remaining, left)),
    );
    remaining = input_quiet_remaining_ms();
  }
}

export async function pause_for_index_work(): Promise<void> {
  await yield_to_visible_page();
  await wait_for_input_idle();
}

export interface IndexPacer {
  checkpoint(): Promise<void>;
}

export function create_index_pacer(budget_ms: number): IndexPacer {
  let slice_started_at = performance.now();
  let chain: Promise<void> = Promise.resolve();

  ensure_input_listeners();

  const step = async (): Promise<void> => {
    const now = performance.now();

    if (
      now - slice_started_at < budget_ms &&
      input_quiet_remaining_ms(now) === 0
    ) {
      return;
    }

    await pause_for_index_work();
    slice_started_at = performance.now();
  };

  return {
    checkpoint(): Promise<void> {
      if (!config.enabled) return Promise.resolve();

      const link = chain.then(step);

      chain = link.catch(() => undefined);

      return link;
    },
  };
}
