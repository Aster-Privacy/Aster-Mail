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

function SkeletonHeading() {
  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-36" />
    </div>
  );
}

export function ReferralTabSkeleton() {
  return (
    <IslandSections aria-busy="true">
      <div>
        <SkeletonHeading />
        <Island className="space-y-3" padding="md">
          <Skeleton className="h-3.5 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </Island>
      </div>
      <div>
        <SkeletonHeading />
        <Island className="grid grid-cols-3 gap-3" padding="md">
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </Island>
      </div>
      <div>
        <SkeletonHeading />
        <Island className="space-y-3" padding="md">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </Island>
      </div>
    </IslandSections>
  );
}
