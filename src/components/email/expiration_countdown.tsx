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
import { FireIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

interface ExpirationCountdownProps {
  expires_at: Date | string;
  show_icon?: boolean;
  show_label?: boolean;
  size?: "sm" | "md" | "lg";
  on_expired?: () => void;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total_ms: number;
}

function calculate_time_remaining(expires_at: Date): TimeRemaining {
  const now = new Date();
  const total_ms = expires_at.getTime() - now.getTime();

  if (total_ms <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total_ms: 0 };
  }

  const seconds = Math.floor((total_ms / 1000) % 60);
  const minutes = Math.floor((total_ms / (1000 * 60)) % 60);
  const hours = Math.floor((total_ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total_ms / (1000 * 60 * 60 * 24));

  return { days, hours, minutes, seconds, total_ms };
}

function format_countdown(
  time: TimeRemaining,
  t: (key: never) => string,
): string {
  if (time.total_ms <= 0) {
    return t("common.expired" as never);
  }

  if (time.days > 0) {
    return `${time.days}d ${time.hours}h`;
  }

  if (time.hours > 0) {
    return `${time.hours}h ${time.minutes}m`;
  }

  if (time.minutes > 0) {
    return `${time.minutes}m ${time.seconds}s`;
  }

  return `${time.seconds}s`;
}

function get_urgency_color(time: TimeRemaining): {
  bg: string;
  text: string;
  border: string;
} {
  const { total_ms } = time;

  if (total_ms <= 0) {
    return {
      bg: "rgba(107, 114, 128, 0.15)",
      text: "#6b7280",
      border: "rgba(107, 114, 128, 0.3)",
    };
  }

  const one_hour = 60 * 60 * 1000;
  const one_day = 24 * one_hour;

  if (total_ms <= one_hour) {
    return {
      bg: "rgba(239, 68, 68, 0.15)",
      text: "var(--color-danger)",
      border: "rgba(239, 68, 68, 0.3)",
    };
  }

  if (total_ms <= one_day) {
    return {
      bg: "rgba(234, 179, 8, 0.15)",
      text: "#eab308",
      border: "rgba(234, 179, 8, 0.3)",
    };
  }

  return {
    bg: "rgba(34, 197, 94, 0.15)",
    text: "var(--color-success)",
    border: "rgba(34, 197, 94, 0.3)",
  };
}

const SIZE_CLASSES = {
  sm: {
    container: "px-1.5 py-0.5 text-xs gap-1",
    icon: "w-3 h-3",
  },
  md: {
    container: "px-2 py-1 text-xs gap-1.5",
    icon: "w-3.5 h-3.5",
  },
  lg: {
    container: "px-2.5 py-1.5 text-sm gap-2",
    icon: "w-4 h-4",
  },
};

export function ExpirationCountdown({
  expires_at,
  show_icon = true,
  show_label = true,
  size = "md",
  on_expired,
}: ExpirationCountdownProps) {
  const { t } = use_i18n();

  const expiry_date = useMemo(() => {
    if (expires_at instanceof Date) {
      return expires_at;
    }

    return new Date(expires_at);
  }, [expires_at]);

  const [time_remaining, set_time_remaining] = useState<TimeRemaining>(() =>
    calculate_time_remaining(expiry_date),
  );

  useEffect(() => {
    const update_countdown = () => {
      const new_time = calculate_time_remaining(expiry_date);

      set_time_remaining(new_time);

      if (new_time.total_ms <= 0 && on_expired) {
        on_expired();
      }
    };

    update_countdown();

    const interval = setInterval(update_countdown, 1000);

    return () => clearInterval(interval);
  }, [expiry_date, on_expired]);

  const colors = get_urgency_color(time_remaining);
  const formatted = format_countdown(time_remaining, t);
  const size_class = SIZE_CLASSES[size];

  if (time_remaining.total_ms <= 0) {
    return (
      <Tooltip position="bottom" tip={t("mail.self_destruct_tooltip")}>
        <div
          className={`inline-flex items-center rounded-md font-medium cursor-default ${size_class.container}`}
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`,
          }}
        >
          {show_icon && <FireIcon className={size_class.icon} />}
          <span>{t("common.expired")}</span>
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip position="bottom" tip={t("mail.self_destruct_tooltip")}>
      <div
        className={`inline-flex items-center rounded-md font-medium cursor-default ${size_class.container}`}
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          border: `1px solid ${colors.border}`,
        }}
      >
        {show_icon && <FireIcon className={size_class.icon} />}
        <span>
          {show_label && t("common.expires_in")}
          {formatted}
        </span>
      </div>
    </Tooltip>
  );
}

export function ExpirationBanner({
  expires_at,
  on_expired,
}: {
  expires_at: Date | string;
  on_expired?: () => void;
}) {
  const { t } = use_i18n();

  const expiry_date = useMemo(() => {
    if (expires_at instanceof Date) {
      return expires_at;
    }

    return new Date(expires_at);
  }, [expires_at]);

  const [time_remaining, set_time_remaining] = useState<TimeRemaining>(() =>
    calculate_time_remaining(expiry_date),
  );

  useEffect(() => {
    const update_countdown = () => {
      const new_time = calculate_time_remaining(expiry_date);

      set_time_remaining(new_time);

      if (new_time.total_ms <= 0 && on_expired) {
        on_expired();
      }
    };

    update_countdown();
    const interval = setInterval(update_countdown, 1000);

    return () => clearInterval(interval);
  }, [expiry_date, on_expired]);

  const formatted = format_countdown(time_remaining, t);

  if (time_remaining.total_ms <= 0) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
        style={{
          backgroundColor: "rgba(107, 114, 128, 0.15)",
          color: "#6b7280",
          border: "1px solid rgba(107, 114, 128, 0.3)",
        }}
      >
        <FireIcon className="w-4 h-4" />
        <span>{t("common.expired")}</span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
      style={{
        backgroundColor: "rgba(239, 68, 68, 0.15)",
        color: "var(--color-danger)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
      }}
    >
      <FireIcon className="w-4 h-4" />
      <span>{t("mail.self_destructs_in", { time: formatted })}</span>
    </div>
  );
}
