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
interface NavSectionSkeletonProps {
  rows?: number;
  row_height?: string;
}

export function NavSectionSkeleton({
  rows = 3,
  row_height = "h-7",
}: NavSectionSkeletonProps) {
  return (
    <div className="space-y-1 px-2.5 py-1">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={`${row_height} w-full animate-pulse rounded-[12px] bg-black/[0.04] dark:bg-white/[0.06]`}
        />
      ))}
    </div>
  );
}
