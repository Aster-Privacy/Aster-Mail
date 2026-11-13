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
const PIN_PREFIX = "aster:folder_kdf_v2:";

function storage_available(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

export function is_folder_kdf_pinned(folder_id: string): boolean {
  if (!storage_available()) return false;

  try {
    return localStorage.getItem(PIN_PREFIX + folder_id) === "1";
  } catch {
    return false;
  }
}

export function pin_folder_kdf(folder_id: string): void {
  if (!storage_available()) return;

  try {
    localStorage.setItem(PIN_PREFIX + folder_id, "1");
  } catch {
    return;
  }
}
