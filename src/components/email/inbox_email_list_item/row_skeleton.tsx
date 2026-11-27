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
import { useLayoutEffect, useRef, useState } from "react";

import { MAIL_ROW_LAYOUT, get_density_classes } from "./helpers";

import { Skeleton } from "@/components/ui/skeleton";
import { use_preferences } from "@/contexts/preferences_context";
import {
  is_compact_density,
  list_row_intrinsic_height,
  list_select_slot_class,
  resolve_list_density,
} from "@/lib/list_density";
import { cn } from "@/lib/utils";

const SENDER_WIDTHS = ["w-24 sm:w-28", "w-20 sm:w-24", "w-28 sm:w-32"];
const SUBJECT_WIDTHS = ["w-2/5", "w-1/3", "w-1/2"];
const PREVIEW_WIDTHS = ["w-full", "w-4/5", "w-11/12"];

export function SkeletonLine({ className }: { className: string }) {
  return (
    <div className={cn("flex items-center h-[1lh]", className)}>
      <Skeleton className="h-[0.75em] w-full rounded-full" />
    </div>
  );
}

interface MailRowSkeletonProps {
  className?: string;
  index?: number;
}

export function MailRowSkeleton({
  className,
  index = 0,
}: MailRowSkeletonProps) {
  const { preferences } = use_preferences();
  const density = resolve_list_density(preferences.mail_list_density);
  const compact_mode = preferences.compact_mode ?? false;
  const compact_rows = is_compact_density(density, compact_mode);
  const show_avatar = preferences.show_profile_pictures !== false;
  const show_preview = preferences.show_email_preview !== false;
  const pick = (widths: string[]) => widths[index % widths.length];

  return (
    <div
      aria-hidden="true"
      className={cn(
        MAIL_ROW_LAYOUT.row,
        get_density_classes(density, compact_mode),
        className,
      )}
      data-testid="mail-row-skeleton"
    >
      <div
        className={cn(
          MAIL_ROW_LAYOUT.select_slot,
          list_select_slot_class(compact_rows, show_avatar),
        )}
        data-testid="mail-row-skeleton-slot"
      >
        <Skeleton
          className={cn(
            "size-full",
            show_avatar ? "rounded-full" : "rounded-[5px]",
          )}
        />
      </div>
      <div className={MAIL_ROW_LAYOUT.content}>
        <div className={MAIL_ROW_LAYOUT.sender}>
          <SkeletonLine
            className={cn("text-sm max-w-full", pick(SENDER_WIDTHS))}
          />
        </div>
        <div className={MAIL_ROW_LAYOUT.subject}>
          <SkeletonLine
            className={cn(
              "text-sm",
              show_preview ? cn("shrink-0", pick(SUBJECT_WIDTHS)) : "w-3/5",
            )}
          />
          {show_preview && (
            <div
              className="flex-1 min-w-0 opacity-60"
              data-testid="mail-row-skeleton-preview"
            >
              <SkeletonLine className={cn("text-sm", pick(PREVIEW_WIDTHS))} />
            </div>
          )}
        </div>
        <SkeletonLine className={cn(MAIL_ROW_LAYOUT.mobile_date, "w-10")} />
      </div>
      <div className={MAIL_ROW_LAYOUT.meta}>
        <SkeletonLine className="text-xs w-12" />
      </div>
    </div>
  );
}

interface MailRowSkeletonListProps {
  row_class_name?: string;
  first_row_class_name?: string;
}

function rows_to_fill(available_height: number, row_height: number): number {
  return Math.max(Math.ceil(available_height / row_height), 1);
}

export function MailRowSkeletonList({
  row_class_name,
  first_row_class_name,
}: MailRowSkeletonListProps) {
  const { preferences } = use_preferences();
  const estimated_row_height = list_row_intrinsic_height(
    resolve_list_density(preferences.mail_list_density),
    preferences.compact_mode ?? false,
    false,
  );
  const container_ref = useRef<HTMLDivElement>(null);
  const [row_count, set_row_count] = useState(() =>
    rows_to_fill(window.innerHeight, estimated_row_height),
  );

  useLayoutEffect(() => {
    const calculate_rows = () => {
      const container = container_ref.current;

      if (!container) return;
      const available_height =
        window.innerHeight - container.getBoundingClientRect().top;
      const measured_row_height =
        container.firstElementChild?.getBoundingClientRect().height;

      set_row_count(
        rows_to_fill(
          available_height,
          measured_row_height || estimated_row_height,
        ),
      );
    };

    calculate_rows();
    window.addEventListener("resize", calculate_rows);

    return () => window.removeEventListener("resize", calculate_rows);
  }, [estimated_row_height]);

  return (
    <div
      ref={container_ref}
      aria-busy="true"
      className="overflow-hidden"
      data-testid="mail-row-skeleton-list"
    >
      {Array.from({ length: row_count }).map((_, i) => (
        <MailRowSkeleton
          key={i}
          className={cn(row_class_name, i === 0 && first_row_class_name)}
          index={i}
        />
      ))}
    </div>
  );
}
