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
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

const REVEAL_DELAY_MS = 180;

interface EmailOpenSkeletonProps {
  compact?: boolean;
}

export function EmailOpenSkeleton({
  compact = false,
}: EmailOpenSkeletonProps): React.ReactElement {
  const [revealed, set_revealed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => set_revealed(true), REVEAL_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      aria-busy="true"
      className="absolute inset-0 z-10 overflow-hidden bg-surf-primary"
    >
      <div
        className="w-full py-2 transition-opacity duration-200 ease-out"
        style={{ opacity: revealed ? 1 : 0 }}
      >
        <div className={compact ? "px-3 mb-3" : "px-3 sm:px-4 mb-3"}>
          <Skeleton
            className={`${compact ? "h-6" : "h-7"} w-full max-w-[55%] rounded-[var(--aster-radius-item)]`}
          />
        </div>
        <div className="mx-2 sm:mx-3 rounded-[var(--aster-island-radius,20px)] bg-[var(--aster-island-fill)] p-4">
          <div className="flex items-center gap-3 min-w-0">
            <Skeleton
              className={`${compact ? "h-8 w-8" : "h-10 w-10"} rounded-full flex-shrink-0`}
            />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-full max-w-[160px] rounded-[var(--aster-radius-item)]" />
              <Skeleton className="h-3 w-full max-w-[110px] rounded-[var(--aster-radius-item)]" />
            </div>
            <Skeleton className="h-3 w-16 flex-shrink-0 rounded-[var(--aster-radius-item)]" />
          </div>
          <div className="space-y-3 pt-6">
            <Skeleton className="h-3.5 w-full rounded-[var(--aster-radius-item)]" />
            <Skeleton className="h-3.5 w-[94%] rounded-[var(--aster-radius-item)]" />
            <Skeleton className="h-3.5 w-[82%] rounded-[var(--aster-radius-item)]" />
            <Skeleton className="h-3.5 w-[90%] rounded-[var(--aster-radius-item)]" />
            <Skeleton className="h-3.5 w-[48%] rounded-[var(--aster-radius-item)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
