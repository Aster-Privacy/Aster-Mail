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
import type {} from "@/lib/i18n/types";

import { storage_pct } from "./helpers";
import { FamilySkeletonRows } from "./family_ui";

export function StorageBar({ used, total }: { used: number; total: number }) {
  const pct = storage_pct(used, total);
  const color =
    pct >= 90
      ? "var(--color-danger)"
      : pct >= 75
        ? "var(--color-warning)"
        : "var(--accent-color)";

  return (
    <div
      className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--text-primary) 10%, transparent)",
      }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function SkeletonRows({
  count = 3,
}: {
  count?: number;
  has_icon?: boolean;
}) {
  return <FamilySkeletonRows count={count} />;
}
