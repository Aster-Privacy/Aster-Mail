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
import { ignore_error } from "@/lib/ignore_error";

export function safe_local_set(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);

    return true;
  } catch (caught) {
    ignore_error("lib/safe_storage:safe_local_set", caught);

    return false;
  }
}

export function safe_local_remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (caught) {
    ignore_error("lib/safe_storage:safe_local_remove", caught);
  }
}
