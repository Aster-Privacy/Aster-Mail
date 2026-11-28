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
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Island, IslandRow, UpgradeBtn } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
import { min_plan_for_feature } from "@/components/settings/billing/billing_constants";

interface PlanUpgradeButtonProps {
  feature?: string | null;
  message?: string;
  on_click?: () => void;
  className?: string;
  disabled?: boolean;
}

export function PlanUpgradeButton({
  feature,
  message,
  on_click,
  className,
  disabled,
}: PlanUpgradeButtonProps) {
  const { t } = use_i18n();
  const tier = min_plan_for_feature(feature ?? null);

  const handle_click =
    on_click ??
    (() =>
      show_plan_limit_upgrade({
        message: message ?? "",
        resource: null,
        feature: feature ?? null,
      }));

  return (
    <UpgradeBtn
      className={className}
      disabled={disabled}
      size="sm"
      onClick={handle_click}
    >
      {tier
        ? t("settings.upgrade_to", { name: tier.name })
        : t("settings.alias_feature_locked_upgrade_cta")}
    </UpgradeBtn>
  );
}

interface PlanLockedPanelProps {
  title?: React.ReactNode;
  description: string;
  feature?: string | null;
  on_upgrade?: () => void;
  className?: string;
}

export function PlanLockedPanel({
  title,
  description,
  feature,
  on_upgrade,
  className,
}: PlanLockedPanelProps) {
  return (
    <Island className={className} padding="none">
      <IslandRow
        className="max-md:[&>span:first-child]:!hidden"
        description={title ? description : undefined}
        icon={<LockClosedIcon aria-hidden="true" />}
        label={
          <>
            <LockClosedIcon
              aria-hidden="true"
              className="mr-1.5 hidden h-4 w-4 align-[-0.125em] text-txt-secondary max-md:inline-block"
            />
            {title ?? description}
          </>
        }
        layout="stacked"
        trailing={
          <PlanUpgradeButton
            feature={feature}
            message={description}
            on_click={on_upgrade}
          />
        }
      />
    </Island>
  );
}
