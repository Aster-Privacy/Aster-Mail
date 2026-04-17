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
import { ChartBarIcon } from "@heroicons/react/24/outline";

import { Progress } from "@/components/ui/progress";
import {
  format_storage,
  type PlanLimitsResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

interface UsageOverviewProps {
  plan_limits: PlanLimitsResponse | null;
}

export function UsageOverview({ plan_limits }: UsageOverviewProps) {
  const { t } = use_i18n();

  return (
    <div className="pt-4">
      <div className="mb-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <ChartBarIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.usage_overview")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <p className="text-sm mb-3 text-txt-muted">
        {t("settings.usage_overview_description")}
      </p>

      {plan_limits ? (
        <div className="space-y-3">
          {[
            {
              key: "email_aliases",
              label: t("settings.usage_aliases"),
            },
            {
              key: "custom_domains",
              label: t("settings.usage_domains"),
            },
            {
              key: "email_templates",
              label: t("settings.usage_templates"),
            },
            {
              key: "signatures",
              label: t("settings.usage_signatures"),
            },
            {
              key: "ghost_aliases_monthly",
              label: t("settings.usage_ghost_aliases"),
            },
          ].map((item) => {
            const info = plan_limits.limits[item.key];

            if (!info) return null;

            const is_unlimited = info.limit === -1;
            const percentage = is_unlimited
              ? 0
              : info.limit > 0
                ? Math.min(100, (info.current / info.limit) * 100)
                : 0;
            const display_limit = is_unlimited
              ? t("settings.usage_unlimited")
              : String(info.limit);

            return (
              <div
                key={item.key}
                className="p-3 rounded-lg bg-surf-tertiary border border-edge-secondary"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-txt-primary">
                    {item.label}
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: info.is_at_limit
                        ? "var(--destructive)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {info.is_at_limit && !is_unlimited
                      ? t("settings.usage_at_limit")
                      : t("settings.usage_of", {
                          current: String(info.current),
                          limit: display_limit,
                        })}
                  </span>
                </div>
                <Progress
                  className={`h-1.5 ${info.is_at_limit ? "[&>div]:bg-red-500" : ""}`}
                  value={is_unlimited ? 0 : percentage}
                />
              </div>
            );
          })}

          <div className="p-3 rounded-lg bg-surf-tertiary border border-edge-secondary">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-txt-primary">
                {t("settings.usage_storage")}
              </span>
              <span
                className="text-xs font-medium"
                style={{
                  color: plan_limits.storage.is_locked
                    ? "var(--destructive)"
                    : plan_limits.storage.is_warning
                      ? "var(--color-warning)"
                      : "var(--text-secondary)",
                }}
              >
                {format_storage(plan_limits.storage.used_bytes)} /{" "}
                {format_storage(plan_limits.storage.limit_bytes)}
              </span>
            </div>
            <Progress
              className={`h-1.5 ${
                plan_limits.storage.is_locked
                  ? "[&>div]:bg-red-500"
                  : plan_limits.storage.is_warning
                    ? "[&>div]:bg-amber-500"
                    : ""
              }`}
              value={Math.min(100, plan_limits.storage.percentage_used)}
            />
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-surf-tertiary border border-edge-secondary">
          <p className="text-sm text-txt-muted text-center">
            {t("settings.usage_loading")}
          </p>
        </div>
      )}
    </div>
  );
}
