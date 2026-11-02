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
export const IMPORT_KEEPALIVE_CHECK_MS = 60 * 1000;
export const IMPORT_KEEPALIVE_IDLE_MS = 2 * 60 * 1000;

export type KeepaliveTouchResult = "alive" | "lost" | "error";

export interface ImportJobKeepalive {
  run<T>(call: () => Promise<T>): Promise<T>;
  stop(): Promise<void>;
  is_lost(): boolean;
}

export interface ImportJobKeepaliveOptions {
  check_ms?: number;
  idle_ms?: number;
  now?: () => number;
}

export function start_import_job_keepalive(
  touch: () => Promise<KeepaliveTouchResult>,
  options: ImportJobKeepaliveOptions = {},
): ImportJobKeepalive {
  const check_ms = options.check_ms ?? IMPORT_KEEPALIVE_CHECK_MS;
  const idle_ms = options.idle_ms ?? IMPORT_KEEPALIVE_IDLE_MS;
  const now = options.now ?? Date.now;

  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  let last_activity = now();
  let stopped = false;
  let lost = false;

  const run = <T>(call: () => Promise<T>): Promise<T> => {
    pending++;
    const result = tail.then(call, call).finally(() => {
      pending--;
      last_activity = now();
    });

    tail = result.catch(() => undefined);

    return result;
  };

  const timer = setInterval(() => {
    if (stopped || lost || pending > 0) return;
    if (now() - last_activity < idle_ms) return;

    run(touch)
      .then((outcome) => {
        if (outcome === "lost") lost = true;
      })
      .catch(() => undefined);
  }, check_ms);

  return {
    run,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await tail;
    },
    is_lost: () => lost,
  };
}
