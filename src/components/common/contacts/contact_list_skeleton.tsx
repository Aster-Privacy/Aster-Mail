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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const NAME_WIDTHS_PX = [112, 148, 96, 132, 84, 160, 120, 104];
const EMAIL_WIDTHS_PX = [176, 204, 152, 188, 140, 216, 168, 196];

interface ContactListSkeletonProps {
  is_compact: boolean;
  avatar_px: number;
  rows?: number;
}

export function ContactListSkeleton({
  is_compact,
  avatar_px,
  rows = NAME_WIDTHS_PX.length,
}: ContactListSkeletonProps): React.ReactElement {
  return (
    <div aria-hidden="true" data-testid="contact-list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-full flex items-center gap-3 px-5",
            is_compact ? "py-1" : "py-1.5",
          )}
        >
          <span className="contact_select_slot" />
          <span
            className="flex-shrink-0 rounded-full overflow-hidden"
            style={{ width: avatar_px, height: avatar_px }}
          >
            <Skeleton className="block w-full h-full rounded-full" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium">
              <Skeleton
                className="inline-block align-middle h-[10px] max-w-full rounded-[4px]"
                style={{
                  width: NAME_WIDTHS_PX[i % NAME_WIDTHS_PX.length],
                }}
              />
            </div>
            {!is_compact && (
              <div className="text-[12px]">
                <Skeleton
                  className="inline-block align-middle h-[8px] max-w-full rounded-[4px]"
                  style={{
                    width: EMAIL_WIDTHS_PX[i % EMAIL_WIDTHS_PX.length],
                  }}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
