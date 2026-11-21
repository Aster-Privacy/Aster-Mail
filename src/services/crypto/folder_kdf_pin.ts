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
import { array_to_base64 } from "./base64";
import type { EncryptedVault } from "./key_manager_core";
import { get_vault_from_memory } from "./memory_key_store";
import { write_vault_merged } from "./vault_cas_write";
import { with_vault_write_lock } from "./vault_write_lock";

export interface FolderVaultPin {
  key: string;
  current: boolean;
}

const PIN_PREFIX = "aster:folder_kdf_v2:";
const PIN_MAX_LEVEL = 2;
const KEY_DIGEST_TAG = "aster-folder-key-pin-v1\u0000";

export type FolderKeyPins = Record<string, number>;

function storage_available(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

function pin_id(folder_id: string): string {
  return folder_id.toLowerCase();
}

function is_pin_level(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= PIN_MAX_LEVEL
  );
}

export class FolderPinUnavailableError extends Error {
  constructor() {
    super("folder pin state unavailable");
    this.name = "FolderPinUnavailableError";
  }
}

function local_pin_level(folder_id: string): number {
  if (!storage_available()) throw new FolderPinUnavailableError();

  let raw: string | null;

  try {
    raw = localStorage.getItem(PIN_PREFIX + folder_id);
  } catch {
    throw new FolderPinUnavailableError();
  }

  if (raw === null) {
    return 0;
  }

  const level = Number(raw);

  return is_pin_level(level) ? level : PIN_MAX_LEVEL;
}

export function vault_folder_key_pin(
  vault: Pick<EncryptedVault, "folder_key_pins"> | null | undefined,
  folder_id: string,
): number {
  const level = vault?.folder_key_pins?.[pin_id(folder_id)];

  return is_pin_level(level) ? level : 0;
}

export function folder_key_pin_level(
  folder_id: string,
  vault: Pick<EncryptedVault, "folder_key_pins"> | null | undefined,
): number {
  return Math.max(
    vault_folder_key_pin(vault, folder_id),
    local_pin_level(folder_id),
    local_pin_level(pin_id(folder_id)),
  );
}

export function is_folder_kdf_pinned(folder_id: string): boolean {
  return local_pin_level(folder_id) >= 1;
}

function stored_pin_or_zero(folder_id: string): number {
  try {
    return local_pin_level(folder_id);
  } catch {
    return 0;
  }
}

export function pin_folder_kdf(folder_id: string, level = 1): void {
  if (!storage_available() || !is_pin_level(level)) return;
  if (stored_pin_or_zero(folder_id) >= level) return;

  try {
    localStorage.setItem(PIN_PREFIX + folder_id, String(level));
  } catch {
    return;
  }
}

export function merge_folder_key_pins(
  ...sources: unknown[]
): FolderKeyPins | undefined {
  const merged: FolderKeyPins = {};
  let any = false;

  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      continue;
    }

    for (const [folder_id, level] of Object.entries(
      source as Record<string, unknown>,
    )) {
      if (!folder_id || !is_pin_level(level)) continue;

      const id = pin_id(folder_id);

      if ((merged[id] ?? 0) < level) {
        merged[id] = level;
        any = true;
      }
    }
  }

  return any ? merged : undefined;
}

export function with_folder_key_pin(
  pins: FolderKeyPins | undefined,
  folder_id: string,
  level: number,
): FolderKeyPins | null {
  if (!is_pin_level(level)) return null;

  const id = pin_id(folder_id);

  if ((pins?.[id] ?? 0) >= level) return null;

  return { ...(pins ?? {}), [id]: level };
}

export async function folder_key_digest(folder_key: Uint8Array): Promise<string> {
  const tag = new TextEncoder().encode(KEY_DIGEST_TAG);
  const input = new Uint8Array(tag.length + folder_key.length);

  input.set(tag, 0);
  input.set(folder_key, tag.length);

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));

  input.fill(0);

  return array_to_base64(digest.subarray(0, 16));
}

export function vault_folder_pin(folder_id: string): FolderVaultPin | null {
  const pin = get_vault_from_memory()?.folder_pins?.[folder_id];

  if (!pin || typeof pin.key !== "string") return null;

  return { key: pin.key, current: pin.current === true };
}

export function folder_requires_current_kdf(folder_id: string): boolean {
  return (
    is_folder_kdf_pinned(folder_id) ||
    vault_folder_pin(folder_id)?.current === true
  );
}

export async function folder_key_belongs_elsewhere(
  folder_id: string,
  folder_key: Uint8Array,
): Promise<boolean> {
  const pins = get_vault_from_memory()?.folder_pins;

  if (!pins) return false;

  const digest = await folder_key_digest(folder_key);

  return Object.entries(pins).some(
    ([pinned_id, pin]) => pinned_id !== folder_id && pin?.key === digest,
  );
}

export async function remember_folder_pin(
  folder_id: string,
  folder_key: Uint8Array,
  current: boolean,
): Promise<boolean> {
  const digest = await folder_key_digest(folder_key);

  return with_vault_write_lock(async () => {
    const base = get_vault_from_memory();

    if (!base) return false;

    const existing = base.folder_pins?.[folder_id];
    const pin: FolderVaultPin = {
      key: digest,
      current: current || existing?.current === true,
    };

    if (existing?.key === pin.key && existing.current === pin.current) {
      return true;
    }

    const result = await write_vault_merged({
      next: { ...base, folder_pins: { ...base.folder_pins, [folder_id]: pin } },
      base,
    });

    return result.status === "written";
  });
}
