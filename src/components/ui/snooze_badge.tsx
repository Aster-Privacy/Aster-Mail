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
import { useState, useEffect, useMemo } from "react";

import { EmailTag } from "@/components/ui/email_tag";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface SnoozeBadgeProps {
  snoozed_until: string;
  muted?: boolean;
  size?: "xs" | "sm" | "default" | "lg";
  className?: string;
}

function format_time_remaining(
  target: Date,
  t?: (key: never) => string,
): string {
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return t ? t("common.now" as never) : "Now";
  }

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remaining_hours = hours % 24;

    if (remaining_hours > 0 && days < 7) {
      return `${days}d ${remaining_hours}h`;
    }

    return `${days}d`;
  }

  if (hours > 0) {
    const remaining_minutes = minutes % 60;

    if (remaining_minutes > 0 && hours < 12) {
      return `${hours}h ${remaining_minutes}m`;
    }

    return `${hours}h`;
  }

  return `${minutes}m`;
}

function get_update_interval(target: Date): number {
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return 0;
  }

  if (diff <= 5 * 60 * 1000) {
    return 10 * 1000;
  }

  if (diff <= 60 * 60 * 1000) {
    return 30 * 1000;
  }

  return 60 * 1000;
}

export function SnoozeBadge({
  snoozed_until,
  muted = false,
  size = "default",
  className,
}: SnoozeBadgeProps) {
  const { t } = use_i18n();
  const target_date = useMemo(() => new Date(snoozed_until), [snoozed_until]);
  const [time_remaining, set_time_remaining] = useState(() =>
    format_time_remaining(target_date, t),
  );

  useEffect(() => {
    set_time_remaining(format_time_remaining(target_date, t));

    const update_time = () => {
      set_time_remaining(format_time_remaining(target_date, t));
    };

    let interval_id: number | null = null;

    const schedule_next_update = () => {
      const interval = get_update_interval(target_date);

      if (interval > 0) {
        interval_id = window.setInterval(() => {
          update_time();
          const new_interval = get_update_interval(target_date);

          if (new_interval !== interval && interval_id !== null) {
            window.clearInterval(interval_id);
            schedule_next_update();
          }
        }, interval);
      }
    };

    schedule_next_update();

    return () => {
      if (interval_id !== null) {
        window.clearInterval(interval_id);
      }
    };
  }, [target_date]);

  return (
    <EmailTag
      className={cn(className)}
      label={time_remaining}
      muted={muted}
      size={size}
      variant="snoozed"
    />
  );
}
