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
import type { ReactNode } from "react";

import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";

export type BillingMeterStatus = "ok" | "near" | "full";

export function billing_meter_status(
  percent: number,
  over_limit: boolean,
): BillingMeterStatus {
  if (over_limit || percent >= 100) return "full";
  if (percent >= 80) return "near";

  return "ok";
}

const status_styles: Record<
  BillingMeterStatus,
  { color: string; icon: typeof CheckCircleIcon }
> = {
  ok: { color: "var(--color-success)", icon: CheckCircleIcon },
  near: { color: "var(--color-warning)", icon: ExclamationTriangleIcon },
  full: { color: "var(--color-danger)", icon: ExclamationCircleIcon },
};

function MeterBar({
  percent,
  status,
  label,
}: {
  percent: number;
  status: BillingMeterStatus;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(percent)}
      className="h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--text-primary) 10%, transparent)",
      }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${percent}%`,
          backgroundColor:
            status === "full"
              ? "var(--color-danger)"
              : status === "near"
                ? "var(--color-warning)"
                : "var(--accent-color)",
        }}
      />
    </div>
  );
}

function MeterHeader({
  label,
  value,
  status,
  status_label,
  trailing,
}: {
  label: ReactNode;
  value: string;
  status: BillingMeterStatus;
  status_label: string | null;
  trailing?: ReactNode;
}) {
  const styles = status_styles[status];
  const StatusIcon = styles.icon;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[14px] font-medium text-txt-primary">
          {label}
        </span>
        {status !== "ok" && status_label && (
          <span
            className="inline-flex flex-shrink-0 items-center gap-1 text-[12px] font-semibold"
            style={{ color: styles.color }}
          >
            <StatusIcon aria-hidden="true" className="h-[14px] w-[14px]" />
            {status_label}
          </span>
        )}
      </div>
      <div className="flex flex-shrink-0 items-baseline gap-3">
        <span className="text-[13px] tabular-nums text-txt-muted">{value}</span>
        {trailing}
      </div>
    </div>
  );
}

interface BillingMeterProps {
  label: ReactNode;
  used_bytes: number;
  limit_bytes: number;
  percent: number;
  over_limit?: boolean;
  trailing?: ReactNode;
  class_name?: string;
}

export function BillingMeter({
  label,
  used_bytes,
  limit_bytes,
  percent,
  over_limit = false,
  trailing,
  class_name = "",
}: BillingMeterProps) {
  const { t } = use_i18n();
  const status = billing_meter_status(percent, over_limit);
  const clamped = Math.max(0, Math.min(100, percent));
  const status_label = t(`settings.billing_storage_status_${status}`);
  const value = t("settings.storage_used_of_total", {
    used: format_bytes(used_bytes),
    total: format_bytes(limit_bytes),
  });

  return (
    <div className={`flex flex-col gap-2 ${class_name}`} data-status={status}>
      <MeterHeader
        label={label}
        status={status}
        status_label={status_label}
        trailing={trailing}
        value={value}
      />
      <MeterBar label={value} percent={clamped} status={status} />
    </div>
  );
}

interface BillingUsageMeterProps {
  label: ReactNode;
  current: number;
  limit: number | null;
  loaded: boolean;
  on_upgrade?: () => void;
  class_name?: string;
}

export function BillingUsageMeter({
  label,
  current,
  limit,
  loaded,
  on_upgrade,
  class_name = "",
}: BillingUsageMeterProps) {
  const { t } = use_i18n();
  const unlimited = !loaded || limit === null || limit <= 0;
  const percent = unlimited ? 0 : (current / (limit as number)) * 100;
  const status = unlimited
    ? "ok"
    : billing_meter_status(percent, current >= (limit as number));
  const clamped = Math.max(0, Math.min(100, percent));
  const value_text = unlimited
    ? t("settings.usage_in_use", { current })
    : t("settings.usage_of", { current, limit: limit as number });
  const status_label =
    loaded && !unlimited
      ? t(`settings.billing_storage_status_${status}`)
      : null;
  const show_upgrade = loaded && !unlimited && status !== "ok" && on_upgrade;

  return (
    <div className={`flex flex-col gap-2 ${class_name}`} data-status={status}>
      <MeterHeader
        label={label}
        status={status}
        status_label={status_label}
        value={value_text}
      />
      {!unlimited && (
        <MeterBar label={value_text} percent={clamped} status={status} />
      )}
      {show_upgrade && (
        <div className="flex justify-end">
          <button
            className="text-[12.5px] font-medium hover:underline"
            style={{ color: "var(--accent-color)" }}
            type="button"
            onClick={on_upgrade}
          >
            {t("settings.billing_usage_upgrade_hint")}
          </button>
        </div>
      )}
    </div>
  );
}
