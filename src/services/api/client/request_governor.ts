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
export const BACKGROUND_PAUSE_MIN_MS = 2000;
export const BACKGROUND_PAUSE_MAX_MS = 60_000;
export const RATE_LIMIT_RECOVERED_EVENT = "aster:rate-limit-recovered";

type Listener = () => void;

let paused_until = 0;
let resume_timer: ReturnType<typeof setTimeout> | null = null;
const waiters = new Set<Listener>();
const recovery_listeners = new Set<Listener>();

function clamp_pause(hold_ms: number): number {
  if (!Number.isFinite(hold_ms)) return BACKGROUND_PAUSE_MIN_MS;

  return Math.min(
    BACKGROUND_PAUSE_MAX_MS,
    Math.max(BACKGROUND_PAUSE_MIN_MS, Math.round(hold_ms)),
  );
}

function notify_recovered(): void {
  const pending = Array.from(waiters);

  waiters.clear();
  for (const resolve of pending) resolve();

  for (const listener of Array.from(recovery_listeners)) {
    try {
      listener();
    } catch {
      continue;
    }
  }

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(RATE_LIMIT_RECOVERED_EVENT));
    } catch {
      return;
    }
  }
}

function schedule_resume(): void {
  if (resume_timer !== null) clearTimeout(resume_timer);

  const remaining = Math.max(0, paused_until - Date.now());

  resume_timer = setTimeout(() => {
    resume_timer = null;

    if (Date.now() < paused_until) {
      schedule_resume();

      return;
    }

    notify_recovered();
  }, remaining);
}

export function pause_background_requests(hold_ms: number): void {
  const until = Date.now() + clamp_pause(hold_ms);

  if (until <= paused_until) return;

  paused_until = until;
  schedule_resume();
}

export function background_pause_remaining_ms(): number {
  return Math.max(0, paused_until - Date.now());
}

export function is_background_paused(): boolean {
  return background_pause_remaining_ms() > 0;
}

export function wait_for_background_window(): Promise<void> {
  if (!is_background_paused()) return Promise.resolve();

  return new Promise((resolve) => {
    waiters.add(resolve);
  });
}

export function on_rate_limit_recovered(listener: Listener): () => void {
  recovery_listeners.add(listener);

  return () => {
    recovery_listeners.delete(listener);
  };
}

export function reset_request_governor(): void {
  paused_until = 0;

  if (resume_timer !== null) {
    clearTimeout(resume_timer);
    resume_timer = null;
  }

  const pending = Array.from(waiters);

  waiters.clear();
  for (const resolve of pending) resolve();
  recovery_listeners.clear();
}
