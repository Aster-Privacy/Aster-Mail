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
import { UpgradeBtn } from "@aster/ui";

import { Progress } from "@/components/ui/progress";
import { use_i18n } from "@/lib/i18n/context";
import { compute_alias_usage, type AliasUsageLevel } from "@/lib/alias_usage";
import { show_alias_cap_upsell } from "@/stores/alias_cap_upsell_store";

interface AliasUsageMeterProps {
  used: number;
  limit: number;
  on_upgrade?: () => void;
  show_upgrade_action?: boolean;
  className?: string;
}

const BAR_CLASS: Record<AliasUsageLevel, string> = {
  normal: "",
  approaching: "[&>div]:bg-amber-500",
  at_limit: "[&>div]:bg-red-500",
};

const BORDER_COLOR: Record<AliasUsageLevel, string> = {
  normal: "var(--border-secondary)",
  approaching: "color-mix(in srgb, var(--color-warning) 45%, transparent)",
  at_limit: "color-mix(in srgb, var(--destructive) 45%, transparent)",
};

export function AliasUsageMeter({
  used,
  limit,
  on_upgrade,
  show_upgrade_action = true,
  className,
}: AliasUsageMeterProps) {
  const { t } = use_i18n();
  const usage = compute_alias_usage(used, limit);

  if (usage.is_unlimited) return null;

  const handle_upgrade =
    on_upgrade ??
    (() => show_alias_cap_upsell({ used: usage.used, limit: usage.limit }));

  return (
    <div
      className={`rounded-xl border bg-surf-tertiary px-3.5 py-3 ${className ?? ""}`}
      style={{ borderColor: BORDER_COLOR[usage.level] }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-txt-primary">
          {t("settings.usage_aliases")}
        </span>
        <span
          className="text-xs font-medium tabular-nums"
          style={{
            color:
              usage.level === "at_limit"
                ? "var(--destructive)"
                : "var(--text-secondary)",
          }}
        >
          {t("settings.used_count", {
            current: usage.used,
            max: usage.limit,
          })}
        </span>
      </div>

      <Progress
        className={`h-1.5 ${BAR_CLASS[usage.level]}`}
        value={usage.percent}
      />

      {usage.level !== "normal" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] leading-5 text-txt-secondary">
            {usage.level === "at_limit"
              ? t("settings.alias_limit_all_used", {
                  used: usage.used,
                  count: usage.limit,
                })
              : t("settings.alias_usage_remaining", {
                  count: usage.remaining,
                })}
          </p>
          {show_upgrade_action && (
            <UpgradeBtn size="sm" onClick={handle_upgrade}>
              {t("settings.alias_feature_locked_upgrade_cta")}
            </UpgradeBtn>
          )}
        </div>
      )}
    </div>
  );
}
