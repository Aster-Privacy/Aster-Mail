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
import type { ComponentType, LazyExoticComponent } from "react";

import { lazy } from "react";

import {
  error_message_of,
  is_chunk_load_error,
  trigger_chunk_recovery,
} from "@/lib/chunk_recovery";

const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 1000;

export function import_with_retry<T>(
  import_fn: () => Promise<T>,
  retries = DEFAULT_RETRIES,
  delay = DEFAULT_DELAY_MS,
): Promise<T> {
  const attempt = (remaining: number): Promise<T> =>
    import_fn().catch((error: unknown) => {
      const is_chunk_error = is_chunk_load_error(error_message_of(error));

      if (is_chunk_error && remaining <= 0) {
        if (trigger_chunk_recovery()) return new Promise<T>(() => {});

        throw error;
      }

      if (remaining <= 0) throw error;

      return new Promise<T>((resolve) =>
        setTimeout(() => resolve(attempt(remaining - 1)), delay),
      );
    });

  return attempt(retries);
}

export function lazy_with_retry<T extends { default: ComponentType<any> }>(
  import_fn: () => Promise<T>,
  retries = DEFAULT_RETRIES,
  delay = DEFAULT_DELAY_MS,
): LazyExoticComponent<T["default"]> {
  return lazy(() => import_with_retry(import_fn, retries, delay));
}

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const PRELOAD_IDLE_TIMEOUT_MS = 3000;
const PRELOAD_FALLBACK_DELAY_MS = 1500;

export function preload_when_idle(preload: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const idle_window = window as IdleWindow;

  if (typeof idle_window.requestIdleCallback === "function") {
    const handle = idle_window.requestIdleCallback(preload, {
      timeout: PRELOAD_IDLE_TIMEOUT_MS,
    });

    return () => idle_window.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(preload, PRELOAD_FALLBACK_DELAY_MS);

  return () => window.clearTimeout(timer);
}
