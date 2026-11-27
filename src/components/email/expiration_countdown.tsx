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
import type { TranslationKey } from "@/lib/i18n/types";
import type { CSSProperties, ReactNode } from "react";

import { useEffect, useRef, useState } from "react";
import { ClockIcon } from "@heroicons/react/16/solid";
import { Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

export type ExpiryUrgency = "later" | "today" | "soon" | "expired";

export type ExpiryPillSize = "sm" | "md" | "lg";

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

type Translate = (key: TranslationKey) => string;

export function expiry_urgency(remaining_ms: number): ExpiryUrgency {
  if (!Number.isFinite(remaining_ms) || remaining_ms <= 0) return "expired";
  if (remaining_ms <= ONE_HOUR_MS) return "soon";
  if (remaining_ms <= ONE_DAY_MS) return "today";

  return "later";
}

export function format_expiry_remaining(
  remaining_ms: number,
  t: Translate,
): string {
  if (!Number.isFinite(remaining_ms) || remaining_ms <= 0) return "";

  const days = Math.floor(remaining_ms / ONE_DAY_MS);
  const hours = Math.floor((remaining_ms % ONE_DAY_MS) / ONE_HOUR_MS);
  const minutes = Math.floor((remaining_ms % ONE_HOUR_MS) / ONE_MINUTE_MS);
  const seconds = Math.floor((remaining_ms % ONE_MINUTE_MS) / 1000);
  const day_unit = t("common.time_days_short");
  const hour_unit = t("common.time_hours_short");
  const minute_unit = t("common.time_minutes_short");
  const second_unit = t("common.time_seconds_short");

  if (days > 0) {
    return hours > 0
      ? `${days}${day_unit} ${hours}${hour_unit}`
      : `${days}${day_unit}`;
  }
  if (hours > 0) {
    return minutes > 0
      ? `${hours}${hour_unit} ${minutes}${minute_unit}`
      : `${hours}${hour_unit}`;
  }
  if (minutes > 0) return `${minutes}${minute_unit}`;

  return `${Math.max(1, seconds)}${second_unit}`;
}

function to_time(expires_at: Date | string | null): number {
  if (!expires_at) return Number.NaN;

  return expires_at instanceof Date
    ? expires_at.getTime()
    : new Date(expires_at).getTime();
}

export interface ExpiryState {
  urgency: ExpiryUrgency;
  remaining: string;
}

function read_expiry_state(target: number, t: Translate): ExpiryState {
  const remaining_ms = target - Date.now();

  return {
    urgency: expiry_urgency(remaining_ms),
    remaining: format_expiry_remaining(remaining_ms, t),
  };
}

export function use_expiry_state(
  expires_at: Date | string | null,
  on_expired?: () => void,
): ExpiryState {
  const { t } = use_i18n();
  const target = to_time(expires_at);
  const on_expired_ref = useRef(on_expired);
  const [state, set_state] = useState<ExpiryState>(() =>
    read_expiry_state(target, t),
  );

  useEffect(() => {
    on_expired_ref.current = on_expired;
  }, [on_expired]);

  useEffect(() => {
    let fired = false;

    const tick = () => {
      const next = read_expiry_state(target, t);

      set_state((prev) =>
        prev.urgency === next.urgency && prev.remaining === next.remaining
          ? prev
          : next,
      );

      if (next.urgency === "expired" && !fired && Number.isFinite(target)) {
        fired = true;
        on_expired_ref.current?.();
      }

      return next.urgency;
    };

    if (tick() === "expired") return;

    const interval = window.setInterval(() => {
      if (tick() === "expired") window.clearInterval(interval);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [target, t]);

  return state;
}

const URGENCY_TONE: Record<ExpiryUrgency, string> = {
  later: "slate",
  today: "amber",
  soon: "rose",
  expired: "slate",
};

export function expiry_pill_style(urgency: ExpiryUrgency): CSSProperties {
  const tone = URGENCY_TONE[urgency];

  return {
    backgroundColor: `var(--cat-${tone}-soft)`,
    color: `var(--cat-${tone}-fg)`,
    boxShadow: `inset 0 0 0 1px var(--cat-${tone}-border)`,
  };
}

const PILL_SIZE_CLASSES: Record<ExpiryPillSize, string> = {
  sm: "h-5 px-1.5 gap-1 text-[11px]",
  md: "h-6 px-2 gap-1 text-xs",
  lg: "h-7 px-2.5 gap-1.5 text-[13px]",
};

const PILL_ICON_CLASSES: Record<ExpiryPillSize, string> = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

export function expiry_pill_class(
  size: ExpiryPillSize,
  urgency: ExpiryUrgency,
): string {
  return [
    "inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium leading-none tabular-nums",
    PILL_SIZE_CLASSES[size],
    urgency === "expired" ? "opacity-80" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function ExpiryPillIcon({ size }: { size: ExpiryPillSize }) {
  return (
    <ClockIcon
      aria-hidden="true"
      className={`${PILL_ICON_CLASSES[size]} shrink-0`}
    />
  );
}

interface ExpirationCountdownProps {
  expires_at: Date | string;
  show_icon?: boolean;
  show_label?: boolean;
  size?: ExpiryPillSize;
  on_expired?: () => void;
  show_tooltip?: boolean;
  title?: string;
  trailing?: ReactNode;
}

export function ExpirationCountdown({
  expires_at,
  show_icon = true,
  show_label = true,
  size = "md",
  on_expired,
  show_tooltip = true,
  title,
  trailing,
}: ExpirationCountdownProps) {
  const { t } = use_i18n();
  const { urgency, remaining } = use_expiry_state(expires_at, on_expired);
  const expired = urgency === "expired";
  const label = expired
    ? t("common.expired")
    : show_label
      ? t("mail.expires_in_time", { time: remaining })
      : remaining;
  const hidden_prefix =
    !expired && !show_label
      ? t("mail.expires_in_time", { time: "" }).trim()
      : "";

  const pill = (
    <span
      className={expiry_pill_class(size, urgency)}
      data-testid="expiry-pill"
      data-urgency={urgency}
      style={expiry_pill_style(urgency)}
      title={title}
    >
      {show_icon && <ExpiryPillIcon size={size} />}
      {hidden_prefix && <span className="sr-only">{hidden_prefix} </span>}
      <span>{label}</span>
      {trailing}
    </span>
  );

  if (!show_tooltip) return pill;

  return (
    <Tooltip position="bottom" tip={t("mail.self_destruct_tooltip")}>
      {pill}
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
  const { urgency, remaining } = use_expiry_state(expires_at, on_expired);
  const text =
    urgency === "expired"
      ? t("common.expired")
      : t("mail.self_destructs_in", { time: remaining });

  return (
    <span
      className={expiry_pill_class("lg", urgency)}
      data-testid="expiry-banner"
      data-urgency={urgency}
      style={expiry_pill_style(urgency)}
    >
      <ExpiryPillIcon size="lg" />
      <span>{text}</span>
    </span>
  );
}
