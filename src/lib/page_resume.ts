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
import { is_page_hidden, yield_to_browser } from "@/lib/scheduling";

export type PageResumeReason = "visible" | "focus" | "online" | "pageshow";

export interface PageResumeInfo {
  reasons: ReadonlySet<PageResumeReason>;
  hidden_ms: number;
}

export interface PageResumeOptions {
  min_interval_ms?: number;
}

type PageResumeHandler = (info: PageResumeInfo) => void | Promise<void>;

interface Subscriber {
  handler: PageResumeHandler;
  min_interval_ms: number;
  last_run_at: number;
}

export const RESUME_DEBOUNCE_MS = 250;
export const RESUME_QUIET_MS = 2_000;
export const RESUME_SETTLE_MS = 5_000;

const subscribers = new Set<Subscriber>();
let listeners_attached = false;
let pending_timer: ReturnType<typeof setTimeout> | null = null;
let pending_reasons = new Set<PageResumeReason>();
let hidden_at: number | null = null;
let last_hidden_ms = 0;
let last_flush_at = 0;
let flushing = false;

function now_ms(): number {
  return Date.now();
}

function request_resume(reason: PageResumeReason): void {
  if (is_page_hidden()) return;
  if (hidden_at !== null) {
    last_hidden_ms = Math.max(last_hidden_ms, now_ms() - hidden_at);
    hidden_at = null;
  }
  if (last_flush_at > now_ms()) last_flush_at = 0;
  const in_quiet = now_ms() - last_flush_at < RESUME_QUIET_MS;

  if (reason !== "online" && (flushing || in_quiet)) return;
  pending_reasons.add(reason);
  if (pending_timer !== null) return;
  pending_timer = setTimeout(() => {
    pending_timer = null;
    void flush_resume();
  }, RESUME_DEBOUNCE_MS);
}

async function flush_resume(): Promise<void> {
  if (is_page_hidden()) {
    pending_reasons = new Set();

    return;
  }

  if (flushing) {
    pending_timer = setTimeout(() => {
      pending_timer = null;
      void flush_resume();
    }, RESUME_DEBOUNCE_MS);

    return;
  }

  flushing = true;
  last_flush_at = now_ms();

  const info: PageResumeInfo = {
    reasons: pending_reasons,
    hidden_ms: last_hidden_ms,
  };

  pending_reasons = new Set();
  last_hidden_ms = 0;

  const reconnected = info.reasons.has("online");

  try {
    let ran_any = false;

    for (const subscriber of Array.from(subscribers)) {
      if (!subscribers.has(subscriber)) continue;
      if (is_page_hidden()) break;

      const at = now_ms();

      if (subscriber.last_run_at > at) subscriber.last_run_at = 0;
      if (
        !reconnected &&
        at - subscriber.last_run_at < subscriber.min_interval_ms
      ) {
        continue;
      }
      if (ran_any) await yield_to_browser();
      if (!subscribers.has(subscriber)) continue;

      subscriber.last_run_at = now_ms();
      ran_any = true;

      try {
        await subscriber.handler(info);
      } catch {
        continue;
      }
    }
  } finally {
    flushing = false;
    last_flush_at = now_ms();
  }
}

function on_visibility_change(): void {
  if (document.visibilityState === "hidden") {
    if (hidden_at === null) hidden_at = now_ms();

    return;
  }
  request_resume("visible");
}

function on_focus(): void {
  request_resume("focus");
}

function on_online(): void {
  request_resume("online");
}

function on_page_show(event: PageTransitionEvent): void {
  if (event.persisted) request_resume("pageshow");
}

function attach_listeners(): void {
  if (listeners_attached) return;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  listeners_attached = true;
  if (is_page_hidden()) hidden_at = now_ms();
  document.addEventListener("visibilitychange", on_visibility_change);
  window.addEventListener("focus", on_focus);
  window.addEventListener("online", on_online);
  window.addEventListener("pageshow", on_page_show);
}

export function subscribe_page_resume(
  handler: PageResumeHandler,
  options?: PageResumeOptions,
): () => void {
  const subscriber: Subscriber = {
    handler,
    min_interval_ms: Math.max(0, options?.min_interval_ms ?? 0),
    last_run_at: now_ms(),
  };

  subscribers.add(subscriber);
  attach_listeners();

  return () => {
    subscribers.delete(subscriber);
  };
}

export function is_resume_settling(): boolean {
  if (pending_timer !== null || flushing) return true;
  if (last_flush_at === 0 || last_flush_at > now_ms()) return false;

  return now_ms() - last_flush_at < RESUME_SETTLE_MS;
}

export function should_skip_interval_tick(): boolean {
  return is_page_hidden() || is_resume_settling();
}
