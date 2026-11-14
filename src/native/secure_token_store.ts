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
import { registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

interface SecureTokenStorePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string | null }>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
}

const SecureTokenStore =
  registerPlugin<SecureTokenStorePlugin>("SecureTokenStore");

let availability: Promise<boolean> | null = null;

function protected_store_available(): Promise<boolean> {
  availability ??= SecureTokenStore.isAvailable()
    .then((result) => result.available === true)
    .catch(() => false);

  return availability;
}

async function settle_all(tasks: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(tasks);
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failed) throw failed.reason;
}

export async function native_token_set(
  key: string,
  value: string,
): Promise<void> {
  if (!(await protected_store_available())) {
    await Preferences.set({ key, value });

    return;
  }

  await SecureTokenStore.set({ key, value });
  await Preferences.remove({ key });
}

export async function native_token_get(key: string): Promise<string | null> {
  const legacy = (await Preferences.get({ key })).value ?? null;

  if (!(await protected_store_available())) return legacy;

  if (legacy !== null) {
    await SecureTokenStore.set({ key, value: legacy });
    await Preferences.remove({ key });

    return legacy;
  }

  return (await SecureTokenStore.get({ key })).value ?? null;
}

export async function native_token_remove(key: string): Promise<void> {
  const tasks: Promise<unknown>[] = [Preferences.remove({ key })];

  if (await protected_store_available()) {
    tasks.push(SecureTokenStore.remove({ key }));
  }

  await settle_all(tasks);
}

export async function native_token_clear_all(): Promise<void> {
  const tasks: Promise<unknown>[] = [Preferences.clear()];

  if (await protected_store_available()) {
    tasks.push(SecureTokenStore.clear());
  }

  await settle_all(tasks);
}

export function reset_native_token_store_for_tests(): void {
  availability = null;
}
