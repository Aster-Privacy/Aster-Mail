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
const TAURI_GLOBAL_NAMES = ["__TAURI_INTERNALS__", "__TAURI__"] as const;

function is_plain_object(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function own_global_value(name: string): unknown {
  if (!Object.getOwnPropertyDescriptor(window, name)) return undefined;

  return (window as unknown as Record<string, unknown>)[name];
}

export function has_tauri_runtime(): boolean {
  if (typeof window === "undefined") return false;

  return TAURI_GLOBAL_NAMES.some((name) =>
    is_plain_object(own_global_value(name)),
  );
}
