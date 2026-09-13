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
import { Suspense, useMemo } from "react";

import {
  BillingSection,
  OnionBillingSection,
  FamilySection,
} from "./settings_lazy_sections";

import { use_i18n } from "@/lib/i18n/context";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { use_settings_tabs } from "@/components/settings/use_settings_tabs";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { is_onion_host } from "@/lib/onion_host";

type BillingTab = "billing" | "family";

interface BillingGroupSectionProps {
  is_family_plan: boolean;
}

export function BillingGroupSection({
  is_family_plan,
}: BillingGroupSectionProps) {
  const { t } = use_i18n();
  const on_onion = is_onion_host();
  const tab_keys = useMemo<readonly BillingTab[]>(() => {
    const keys: BillingTab[] = ["billing"];

    if (is_family_plan) keys.push("family");

    return keys;
  }, [is_family_plan]);
  const { active_tab, handle_tab_change, render_tab } = use_settings_tabs(
    tab_keys,
    "billing",
  );

  return (
    <div className="space-y-6">
      {tab_keys.length > 1 && (
        <SettingsTabBar
          active={active_tab}
          layout_id="billing-group"
          on_change={handle_tab_change}
          tabs={tab_keys.map((key) => ({
            key,
            label:
              key === "billing"
                ? t("settings.billing")
                : t("settings.plan_type_family"),
          }))}
        />
      )}

      {render_tab(
        "billing",
        <Suspense fallback={<SettingsSkeleton variant="billing" />}>
          {on_onion ? <OnionBillingSection /> : <BillingSection />}
        </Suspense>,
      )}
      {is_family_plan &&
        render_tab(
          "family",
          <Suspense fallback={<SettingsSkeleton />}>
            <FamilySection is_family_plan={is_family_plan} />
          </Suspense>,
        )}
    </div>
  );
}
