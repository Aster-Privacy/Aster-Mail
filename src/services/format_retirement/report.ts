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
import type { RemainingCounts } from "./runner";

import { FORMAT_CLASS_IDS } from "./switches";

export const REMAINING_REPORT_PATH = "/crypto/v1/format_retirement/remaining";

export interface RemainingReportBody {
  v: 1;
  counts: Record<string, number>;
}

export function build_remaining_report(
  remaining: RemainingCounts,
): RemainingReportBody | null {
  const counts: Record<string, number> = {};

  for (const id of FORMAT_CLASS_IDS) {
    const value = remaining[id];

    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      counts[id] = value;
    }
  }

  return Object.keys(counts).length > 0 ? { v: 1, counts } : null;
}
