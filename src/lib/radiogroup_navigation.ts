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

export function next_radio_index(
  key: string,
  current: number,
  count: number,
  is_rtl: boolean,
): number | null {
  if (count === 0) return null;

  const forward = is_rtl ? "ArrowLeft" : "ArrowRight";
  const backward = is_rtl ? "ArrowRight" : "ArrowLeft";
  const from = current < 0 ? 0 : current;

  if (key === "ArrowDown" || key === forward) return (from + 1) % count;

  if (key === "ArrowUp" || key === backward) return (from - 1 + count) % count;

  if (key === "Home") return 0;

  if (key === "End") return count - 1;

  return null;
}
