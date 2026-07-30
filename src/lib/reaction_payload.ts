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
export function is_reaction_payload_body(
  body: string | null | undefined,
): boolean {
  if (!body) return false;

  const trimmed = body.trim();

  if (!trimmed.startsWith("{") || !trimmed.includes("aster_reaction")) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      aster_reaction?: boolean;
      emoji?: unknown;
    };

    return parsed.aster_reaction === true && typeof parsed.emoji === "string";
  } catch {
    return false;
  }
}
