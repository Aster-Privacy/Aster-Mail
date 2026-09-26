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
import type { ComponentType, SVGProps } from "react";

import {
  AtSymbolIcon,
  CheckCircleIcon,
  CircleStackIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

import { BILLING_CARD_CLASS } from "@/components/settings/billing/billing_skeleton";
import {
  format_storage,
  type PlanLimitsResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

type MeterState = "ok" | "near" | "full" | "unlimited";

interface MeterRow {
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  ratio: number | null;
  state: MeterState;
  status_ok: string;
  status_near: string;
  status_full: string;
}

interface BillingUsageMetersProps {
  storage_used_bytes: number;
  storage_limit_bytes: number;
  plan_limits: PlanLimitsResponse | null;
}

function meter_state(ratio: number | null): MeterState {
  if (ratio === null) return "unlimited";
  if (ratio >= 1) return "full";
  if (ratio >= 0.8) return "near";

  return "ok";
}

const STATE_COLOR: Record<MeterState, string> = {
  ok: "var(--color-success)",
  near: "var(--color-warning)",
  full: "var(--color-danger)",
  unlimited: "var(--text-muted)",
};

const STATE_ICON: Record<
  Exclude<MeterState, "unlimited">,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  ok: CheckCircleIcon,
  near: ExclamationTriangleIcon,
  full: ExclamationCircleIcon,
};

export function BillingUsageMeters({
  storage_used_bytes,
  storage_limit_bytes,
  plan_limits,
}: BillingUsageMetersProps) {
  const { t } = use_i18n();

  const count_row = (
    id: string,
    icon: ComponentType<SVGProps<SVGSVGElement>>,
    label: string,
    limit_key: string,
  ): MeterRow => {
    const info = plan_limits?.limits[limit_key];
    const limit = info?.limit ?? 0;
    const current = info?.current ?? 0;
    const is_unlimited = limit < 0;
    const ratio = is_unlimited ? null : limit === 0 ? 1 : current / limit;

    return {
      id,
      icon,
      label,
      value: is_unlimited
        ? t("settings.unlimited")
        : t("settings.bill_of", { used: current, limit }),
      ratio,
      state: meter_state(ratio),
      status_ok: t("settings.bill_all_good"),
      status_near: t("settings.bill_almost_at_limit"),
      status_full: t("settings.bill_limit_reached"),
    };
  };

  const storage_ratio =
    storage_limit_bytes > 0 ? storage_used_bytes / storage_limit_bytes : 0;
  const rows: MeterRow[] = [
    {
      id: "storage",
      icon: CircleStackIcon,
      label: t("settings.storage"),
      value: t("settings.bill_of", {
        used: format_storage(storage_used_bytes),
        limit: format_storage(storage_limit_bytes),
      }),
      ratio: storage_ratio,
      state: meter_state(storage_ratio),
      status_ok: t("settings.bill_all_good"),
      status_near: t("settings.bill_almost_full"),
      status_full: t("settings.bill_action_required"),
    },
    count_row(
      "aliases",
      AtSymbolIcon,
      t("settings.bill_aliases"),
      "max_email_aliases",
    ),
    count_row(
      "domains",
      GlobeAltIcon,
      t("settings.bill_custom_domains"),
      "max_custom_domains",
    ),
  ];

  return (
    <div className={`${BILLING_CARD_CLASS} py-1`}>
      {rows.map((row) => {
        const Icon = row.icon;
        const StatusIcon =
          row.state === "unlimited" ? null : STATE_ICON[row.state];
        const status_text =
          row.state === "ok"
            ? row.status_ok
            : row.state === "near"
              ? row.status_near
              : row.state === "full"
                ? row.status_full
                : t("settings.unlimited");
        const width = Math.min(100, Math.max(0, (row.ratio ?? 0) * 100));

        return (
          <div key={row.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="h-[18px] w-[18px] flex-shrink-0 text-txt-secondary" />
                <span className="truncate text-sm font-medium text-txt-primary">
                  {row.label}
                </span>
              </div>
              <span
                className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold"
                style={{ color: STATE_COLOR[row.state] }}
              >
                {StatusIcon && <StatusIcon className="h-[15px] w-[15px]" />}
                {status_text}
              </span>
            </div>
            {row.state !== "unlimited" && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surf-tertiary">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${width}%`,
                    backgroundColor: STATE_COLOR[row.state],
                  }}
                />
              </div>
            )}
            <span className="text-[13px] text-txt-muted">{row.value}</span>
          </div>
        );
      })}
    </div>
  );
}
