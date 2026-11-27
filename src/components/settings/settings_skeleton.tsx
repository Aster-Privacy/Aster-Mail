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
import { Island, IslandSections, Skeleton } from "@aster/ui";

import { use_delayed_flag } from "@/hooks/use_delayed_flag";

export const SETTINGS_SKELETON_DELAY_MS = 150;

type SettingsSkeletonVariant =
  "default" | "list" | "profile" | "billing" | "form";

interface SettingsSkeletonProps {
  variant?: SettingsSkeletonVariant;
}

const SECTION_ROWS: Record<SettingsSkeletonVariant, number[]> = {
  default: [3, 2],
  list: [5],
  profile: [2, 3],
  billing: [2, 3, 2],
  form: [4],
};

function SkeletonSection({ rows }: { rows: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-1 pb-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Island className="space-y-4" padding="md">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        ))}
      </Island>
    </div>
  );
}

export function SettingsSkeleton({
  variant = "default",
}: SettingsSkeletonProps = {}) {
  const visible = use_delayed_flag(true, SETTINGS_SKELETON_DELAY_MS);

  if (!visible) return null;

  return (
    <IslandSections aria-busy="true" className="w-full">
      {SECTION_ROWS[variant].map((rows, index) => (
        <SkeletonSection key={index} rows={rows} />
      ))}
    </IslandSections>
  );
}
