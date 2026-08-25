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
const MAX_LENGTH = 240;

export function server_error_text(
  error: string | undefined | null,
  fallback: string,
): string {
  if (!error) return fallback;

  const trimmed = error.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) return fallback;
  if (!trimmed.includes(" ")) return fallback;
  if (trimmed === trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase()) {
    return fallback;
  }

  return trimmed;
}
