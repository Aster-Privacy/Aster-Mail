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

export type EmailOpenSkeletonVariant = "full" | "split" | "popup" | "detail";

interface EmailOpenSkeletonProps {
  variant?: EmailOpenSkeletonVariant;
}

interface SkeletonLayout {
  surface: string;
  frame: string;
  subject_row: string;
  subject_bar: string;
  thread_wrap: string;
}

const SKELETON_LAYOUTS: Record<EmailOpenSkeletonVariant, SkeletonLayout> = {
  full: {
    surface: "bg-surf-primary",
    frame: "w-full py-4 sm:py-5",
    subject_row: "px-4 sm:px-5 mb-3",
    subject_bar: "h-7 sm:h-8",
    thread_wrap: "mt-4 px-2.5 pb-4",
  },
  split: {
    surface: "bg-surf-primary",
    frame: "mx-auto w-full max-w-[1120px] py-2 @md:py-3",
    subject_row: "px-3 @md:px-4 mb-3",
    subject_bar: "h-6 @md:h-7",
    thread_wrap: "mt-4 px-2.5 pb-4",
  },
  popup: {
    surface: "bg-modal-bg",
    frame: "mx-auto w-full max-w-4xl px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 pb-6",
    subject_row: "mb-3",
    subject_bar: "h-6",
    thread_wrap: "mt-4",
  },
  detail: {
    surface: "bg-surf-primary",
    frame: "mx-auto w-full max-w-4xl",
    subject_row: "mb-3",
    subject_bar: "h-7",
    thread_wrap: "mt-4",
  },
};

const BODY_LINE_WIDTHS = ["w-full", "w-[94%]", "w-[82%]", "w-[90%]", "w-[48%]"];

export function EmailOpenSkeleton({
  variant = "full",
}: EmailOpenSkeletonProps): React.ReactElement {
  const [revealed, set_revealed] = useState(false);
  const layout = SKELETON_LAYOUTS[variant];

  useEffect(() => {
    const timer = window.setTimeout(() => set_revealed(true), REVEAL_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      aria-busy="true"
      className={`absolute inset-0 z-10 overflow-hidden ${layout.surface}`}
    >
      <div
        aria-hidden="true"
        className={`${layout.frame} transition-opacity duration-200 ease-out`}
        style={{ opacity: revealed ? 1 : 0 }}
      >
        <div className={layout.subject_row}>
          <Skeleton
            className={`block ${layout.subject_bar} w-full max-w-[55%] !rounded-[var(--aster-radius-item)]`}
          />
        </div>

        <div className={layout.thread_wrap}>
          <div className="aster_island overflow-hidden">
            <div className="flex items-start gap-3 ps-4 pe-4 pt-3 pb-2">
              <Skeleton className="mt-0.5 block h-10 w-10 flex-shrink-0 !rounded-full" />
              <div className="min-w-0 flex-1 pt-0.5">
                <Skeleton className="block h-4 w-full max-w-[160px] !rounded-[var(--aster-radius-item)]" />
                <Skeleton className="mt-1.5 block h-3 w-full max-w-[110px] !rounded-[var(--aster-radius-item)]" />
              </div>
              <Skeleton className="block h-3 w-16 flex-shrink-0 !rounded-[var(--aster-radius-item)]" />
            </div>

            <div className="space-y-3 ps-[68px] pe-4 pt-3 pb-6">
              {BODY_LINE_WIDTHS.map((width) => (
                <Skeleton
                  key={width}
                  className={`block h-3.5 ${width} !rounded-[var(--aster-radius-item)]`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2 px-4 pb-4">
              <Skeleton className="aster_pill pointer-events-none min-w-0 max-w-[200px] flex-1 !rounded-full" />
              <Skeleton className="aster_pill pointer-events-none min-w-0 max-w-[200px] flex-1 !rounded-full" />
              <Skeleton className="aster_pill pointer-events-none h-10 w-10 flex-shrink-0 !rounded-full !px-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
