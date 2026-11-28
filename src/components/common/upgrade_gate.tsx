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
import { PlanLockedPanel } from "@/components/common/plan_locked";

interface UpgradeGateProps {
  feature_name: string;
  description: string;
  min_plan: string;
  children: React.ReactNode;
  is_locked: boolean;
  variant?: "card" | "centered";
}

function navigate_to_billing() {
  window.dispatchEvent(
    new CustomEvent("navigate-settings", { detail: "billing" }),
  );
}

export function UpgradeGate({
  feature_name,
  description,
  min_plan,
  children,
  is_locked,
  variant = "card",
}: UpgradeGateProps) {
  if (!is_locked) {
    return <>{children}</>;
  }

  const panel = (
    <PlanLockedPanel
      description={description}
      feature={min_plan.toLowerCase()}
      on_upgrade={navigate_to_billing}
      title={feature_name}
    />
  );

  if (variant === "centered") {
    return <div className="px-4 py-6">{panel}</div>;
  }

  return panel;
}
