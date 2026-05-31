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
import { Badge, UpgradeBtn } from "@aster/ui";

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
      className={`flex flex-col items-center gap-3 px-4 py-6 rounded-lg bg-surf-tertiary border border-dashed border-edge-secondary text-center ${className ?? ""}`}
    >
      <Badge color="blue">{t("settings.alias_feature_locked_upgrade_plan")}</Badge>
      <p className="text-sm text-txt-secondary max-w-[280px]">
        {t("settings.upgrade_inline_card_description")}
      </p>
      <UpgradeBtn
        size="sm"
        onClick={() => show_plan_limit_upgrade({ resource: resource_label ?? null })}
      >
        {t("settings.alias_feature_locked_upgrade_cta")}
      </UpgradeBtn>
    </div>
  );
}
