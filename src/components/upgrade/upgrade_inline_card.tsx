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
import { Button } from "@aster/ui";
import { SparklesIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  show_plan_limit_upgrade,
  type UpgradeLimitKey,
} from "@/stores/upgrade_store";

interface UpgradeInlineCardProps {
  limit_key: Exclude<UpgradeLimitKey, "generic">;
  resource_label?: string;
  className?: string;
}

export function UpgradeInlineCard({
  limit_key,
  resource_label,
  className,
}: UpgradeInlineCardProps) {
  const { t } = use_i18n();
  const { is_at_limit } = use_plan_limits();

  if (!is_at_limit(limit_key)) return null;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border ${className ?? ""}`}
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent-blue) 8%, var(--surface-secondary)), var(--surface-secondary))",
        borderColor: "var(--border-primary)",
      }}
    >
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 mt-0.5"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--accent-blue) 18%, transparent)",
          color: "var(--accent-blue)",
        }}
      >
        <SparklesIcon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-txt-primary">
          {t("settings.upgrade_inline_card_title")}
        </p>
        <p className="text-xs mt-0.5 text-txt-muted">
          {t("settings.upgrade_inline_card_description")}
        </p>
      </div>
      <Button
        className="flex-shrink-0"
        size="sm"
        variant="primary"
        onClick={() =>
          show_plan_limit_upgrade({
            resource: resource_label ?? null,
          })
        }
      >
        {t("settings.upgrade_view_plans")}
      </Button>
    </div>
  );
}
