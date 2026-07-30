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
export function get_primary_font_family(stack: string): string | null {
  const first = stack.split(",")[0]?.trim();

  if (!first) return null;

  return first.replace(/^['"]/, "").replace(/['"]$/, "");
}

export function is_font_family_loaded(family: string): boolean {
  if (typeof document === "undefined" || !document.fonts) return false;

  try {
    return document.fonts.check(`1em "${family}"`);
  } catch {
    return false;
  }
}
