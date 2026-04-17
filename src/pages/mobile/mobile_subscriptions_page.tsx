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
import { SubscriptionsContent } from "@/components/subscriptions/subscriptions_content";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_i18n } from "@/lib/i18n/context";

interface MobileSubscriptionsPageProps {
  on_open_drawer: () => void;
}

export default function MobileSubscriptionsPage({
  on_open_drawer,
}: MobileSubscriptionsPageProps) {
  const { t } = use_i18n();

  return (
    <div className="flex h-full flex-col bg-[var(--bg-primary)]">
      <UpgradeGate
        description={t("settings.subscription_manager_locked")}
        feature_name={t("settings.plan_f_subscription_manager")}
        is_locked={false}
        min_plan="Star"
        variant="centered"
      >
        <SubscriptionsContent on_mobile_menu_toggle={on_open_drawer} />
      </UpgradeGate>
    </div>
  );
}
