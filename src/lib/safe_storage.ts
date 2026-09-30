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

export function safe_local_get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (caught) {
    ignore_error("lib/safe_storage:safe_local_get", caught);

    return null;
  }
}

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

export function safe_local_keys(): string[] {
  try {
    const keys: string[] = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (key !== null) keys.push(key);
    }

    return keys;
  } catch (caught) {
    ignore_error("lib/safe_storage:safe_local_keys", caught);

    return [];
  }
}

export function safe_session_keys(): string[] {
  try {
    const keys: string[] = [];

    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);

      if (key !== null) keys.push(key);
    }

    return keys;
  } catch (caught) {
    ignore_error("lib/safe_storage:safe_session_keys", caught);

    return [];
  }
}

export function safe_session_get(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch (caught) {
    ignore_error("lib/safe_storage:safe_session_get", caught);

    return null;
  }
}

export function safe_session_set(key: string, value: string): boolean {
  try {
    sessionStorage.setItem(key, value);

    return true;
  } catch (caught) {
    ignore_error("lib/safe_storage:safe_session_set", caught);

    return false;
  }
}

export function safe_session_remove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch (caught) {
    ignore_error("lib/safe_storage:safe_session_remove", caught);
  }
}
