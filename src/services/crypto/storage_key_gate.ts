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
import type { EncryptedVault } from "./key_manager_core";

import { get_vault_from_memory } from "./memory_key_store";

let runner: (() => void) | null = null;
let verified_kek: string | null = null;
let waiters: Array<() => void> = [];

export function set_storage_key_runner(fn: (() => void) | null): void {
  runner = fn;
}

export function mark_storage_key_verified(data_kek: string | null): void {
  verified_kek = data_kek;
  wake_storage_key_waiters();
}

export function wake_storage_key_waiters(): void {
  const pending = waiters;

  waiters = [];
  pending.forEach((resolve) => resolve());
}

export function is_storage_key_held(
  vault: Pick<EncryptedVault, "data_kek" | "data_kek_random"> | null,
): boolean {
  if (!runner || !vault) return false;
  if (vault.data_kek_random === true && vault.data_kek) return false;

  return !vault.data_kek || vault.data_kek !== verified_kek;
}

export function storage_key_waiter_count(): number {
  return waiters.length;
}

export async function wait_for_storage_key(): Promise<void> {
  if (!runner) return;

  while (is_storage_key_held(get_vault_from_memory())) {
    const next = new Promise<void>((resolve) => waiters.push(resolve));

    runner?.();
    await next;
  }
}
