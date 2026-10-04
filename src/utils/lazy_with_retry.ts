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
import type {
  ComponentProps,
  ComponentType,
  LazyExoticComponent,
  ReactElement,
} from "react";

import { createElement, lazy } from "react";

import {
  error_message_of,
  is_chunk_load_error,
  trigger_chunk_recovery,
} from "@/lib/chunk_recovery";

const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 1000;

export class LazyLoadError extends Error {
  readonly source: unknown;
  readonly reset: () => void;

  constructor(source: unknown, reset: () => void = () => {}) {
    super("on demand module did not load");
    this.name = "LazyLoadError";
    this.source = source;
    this.reset = reset;
  }
}

function retry_import<T>(
  import_fn: () => Promise<T>,
  retries: number,
  delay: number,
): Promise<T> {
  const attempt = (remaining: number): Promise<T> =>
    import_fn().catch((error: unknown) => {
      if (remaining <= 0) throw error;

      return new Promise<T>((resolve) =>
        setTimeout(() => resolve(attempt(remaining - 1)), delay),
      );
    });

  return attempt(retries);
}

export function import_with_retry<T>(
  import_fn: () => Promise<T>,
  retries = DEFAULT_RETRIES,
  delay = DEFAULT_DELAY_MS,
): Promise<T> {
  return retry_import(import_fn, retries, delay).catch((error: unknown) => {
    if (
      is_chunk_load_error(error_message_of(error)) &&
      trigger_chunk_recovery()
    ) {
      return new Promise<T>(() => {});
    }

    throw error;
  });
}

export function import_on_demand<T>(
  import_fn: () => Promise<T>,
  retries = DEFAULT_RETRIES,
  delay = DEFAULT_DELAY_MS,
): Promise<T> {
  return retry_import(import_fn, retries, delay).catch((error: unknown) => {
    throw new LazyLoadError(error);
  });
}

export function lazy_with_retry<T extends { default: ComponentType<any> }>(
  import_fn: () => Promise<T>,
  retries = DEFAULT_RETRIES,
  delay = DEFAULT_DELAY_MS,
): LazyExoticComponent<T["default"]> {
  return lazy(() => import_with_retry(import_fn, retries, delay));
}

export function lazy_on_demand<T extends { default: ComponentType<any> }>(
  import_fn: () => Promise<T>,
  retries = DEFAULT_RETRIES,
  delay = DEFAULT_DELAY_MS,
): (props: ComponentProps<T["default"]>) => ReactElement {
  const create = (): LazyExoticComponent<ComponentType<any>> =>
    lazy(() =>
      retry_import(import_fn, retries, delay).catch((error: unknown) => {
        throw new LazyLoadError(error, () => {
          current = create();
        });
      }),
    );
  let current = create();

  return function OnDemandComponent(
    props: ComponentProps<T["default"]>,
  ): ReactElement {
    return createElement(current, props);
  };
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
