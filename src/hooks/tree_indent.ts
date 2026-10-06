//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

export const MAX_INDENT_DEPTH = 6;

export function indent_depth(depth: number | undefined): number {
  const safe = Number.isFinite(depth) ? Math.floor(depth as number) : 0;

  return Math.min(Math.max(0, safe), MAX_INDENT_DEPTH);
}

export function indent_guide_trail(
  trail: boolean[] | undefined,
  depth: number,
): boolean[] | undefined {
  if (!trail) return undefined;

  const visible = indent_depth(depth);

  return trail.length > visible ? trail.slice(trail.length - visible) : trail;
}
