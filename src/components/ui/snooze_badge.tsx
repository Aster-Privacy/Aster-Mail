import { useState, useEffect, useMemo } from "react";

import { EmailTag } from "@/components/ui/email_tag";
import { cn } from "@/lib/utils";

interface SnoozeBadgeProps {
  snoozed_until: string;
  muted?: boolean;
  size?: "xs" | "sm" | "default" | "lg";
  className?: string;
}

function format_time_remaining(target: Date): string {
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return "Now";
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
  const target_date = useMemo(() => new Date(snoozed_until), [snoozed_until]);
  const [time_remaining, set_time_remaining] = useState(() =>
    format_time_remaining(target_date),
  );

  useEffect(() => {
    set_time_remaining(format_time_remaining(target_date));

    const update_time = () => {
      set_time_remaining(format_time_remaining(target_date));
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
