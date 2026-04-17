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
export function open_external(url: string, features?: string): Window | null {
  try {
    const parsed = new URL(url, window.location.origin);

    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      return null;
    }
  } catch {
    return null;
  }

  const base = "noopener,noreferrer";
  const combined = features ? `${base},${features}` : base;

  return window.open(url, "_blank", combined);
}
