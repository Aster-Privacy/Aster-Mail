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
import { useState } from "react";

import { ListBulletIcon } from "@heroicons/react/24/outline";
import { Island, IslandDivider, IslandRow, IslandSection } from "@aster/ui";

import type { PlanFeature } from "@/components/settings/billing/plan_card";

import { PLAN_FEATURE_ICONS } from "@/components/settings/billing/plan_feature_icons";
import { PlanFeaturesModal } from "@/components/settings/billing/plan_features_modal";
import { use_i18n } from "@/lib/i18n/context";

const PREVIEW_ROW_COUNT = 6;

interface BillingAdvantagesCardProps {
  plan_code: string;
  plan_name: string;
  is_paid_plan: boolean;
  features: PlanFeature[];
}

export function BillingAdvantagesCard({
  plan_code,
  plan_name,
  is_paid_plan,
  features,
}: BillingAdvantagesCardProps) {
  const { t } = use_i18n();
  const [features_open, set_features_open] = useState(false);
  const included = features.filter((feature) => feature.on);

  if (included.length === 0) return null;

  const preview = included.slice(0, PREVIEW_ROW_COUNT);
  const title = is_paid_plan
    ? t("settings.billing_advantages_title_paid")
    : t("settings.billing_advantages_title_free", { name: plan_name });

  return (
    <IslandSection bare title={title}>
      <Island padding="none">
        {preview.map((feature, index) => {
          const Icon = feature.icon ? PLAN_FEATURE_ICONS[feature.icon] : null;

          return (
            <div key={`${feature.label}-${index}`}>
              {index > 0 && <IslandDivider inset={52} />}
              <IslandRow
                description={feature.description}
                icon={Icon ? <Icon className="h-[22px] w-[22px]" /> : undefined}
                label={feature.label}
              />
            </div>
          );
        })}
        <IslandDivider inset={52} />
        <IslandRow
          chevron
          icon={<ListBulletIcon className="h-[22px] w-[22px]" />}
          label={t("settings.billing_see_all_features", { name: plan_name })}
          on_press={() => set_features_open(true)}
        />
      </Island>
      <PlanFeaturesModal
        feature_lines={included}
        highlight_plan_code={plan_code}
        is_open={features_open}
        on_close={() => set_features_open(false)}
        plan_name={plan_name}
      />
    </IslandSection>
  );
}
