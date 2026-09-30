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
const LOCK_NAME = "astermail_vault_write";

let chain: Promise<unknown> = Promise.resolve();

function cross_tab_locks(): LockManager | null {
  try {
    if (typeof navigator === "undefined") return null;

    const manager = navigator.locks;

    return typeof manager?.request === "function" ? manager : null;
  } catch {
    return null;
  }
}

function with_tab_lock<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);

  chain = next.then(
    () => undefined,
    () => undefined,
  );

  return next;
}

export function with_vault_write_lock<T>(fn: () => Promise<T>): Promise<T> {
  const manager = cross_tab_locks();

  if (!manager) return with_tab_lock(fn);

  return with_tab_lock(() => manager.request(LOCK_NAME, fn));
}
