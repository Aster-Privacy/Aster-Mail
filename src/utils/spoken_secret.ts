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
const GROUP_SIZE = 4;

export function spoken_secret(secret: string): string {
  const cleaned = typeof secret === "string" ? secret.replace(/\s+/g, "") : "";

  if (!cleaned) return "";

  const groups: string[] = [];

  for (let i = 0; i < cleaned.length; i += GROUP_SIZE) {
    groups.push(
      cleaned
        .slice(i, i + GROUP_SIZE)
        .split("")
        .join(" "),
    );
  }

  return groups.join(", ");
}
