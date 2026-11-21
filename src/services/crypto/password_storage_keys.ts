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
import { base64_to_array } from "./base64";
import { zero_uint8_array } from "./secure_memory";
import { retired_storage_kek_id } from "./retired_storage_keks";

let password_key_ids: Set<string> = new Set();

export function note_password_storage_keys(raws: readonly Uint8Array[]): void {
  password_key_ids = new Set(raws.map((raw) => retired_storage_kek_id(raw)));
}

export function clear_password_storage_keys(): void {
  password_key_ids = new Set();
}

export function is_password_derived_storage_key(
  encoded: string | null | undefined,
): boolean {
  if (!encoded || password_key_ids.size === 0) return false;

  let raw: Uint8Array;

  try {
    raw = base64_to_array(encoded);
  } catch {
    return false;
  }

  try {
    return password_key_ids.has(retired_storage_kek_id(raw));
  } finally {
    zero_uint8_array(raw);
  }
}
