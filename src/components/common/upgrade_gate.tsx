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
import type { TranslationKey } from "@/lib/i18n/types";

import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

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
  const { t } = use_i18n();

  if (!is_locked) {
    return <>{children}</>;
  }

  if (variant === "centered") {
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[60vh] gap-3 px-6">
        <LockClosedIcon className="w-6 h-6 text-txt-muted" />
        <h3 className="text-lg font-semibold text-txt-primary">
          {feature_name}
        </h3>
        <p className="text-sm text-txt-secondary max-w-md">{description}</p>
        <p className="text-sm text-txt-muted">
          {t("settings.available_on_plan" as TranslationKey, {
            plan: min_plan,
          })}
        </p>
        <Button size="lg" variant="depth" onClick={navigate_to_billing}>
          {t("settings.upgrade_to_unlock" as TranslationKey)}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[60vh] gap-2 px-6">
      <LockClosedIcon className="w-6 h-6 text-txt-muted mb-4" />

      <h3 className="text-base font-semibold text-txt-primary mb-2">
        {feature_name}
      </h3>

      <p className="text-sm text-txt-secondary mb-2 max-w-md">{description}</p>

      <p className="text-sm text-txt-muted mb-5">
        {t("settings.available_on_plan" as TranslationKey, {
          plan: min_plan,
        })}
      </p>

      <Button size="lg" variant="depth" onClick={navigate_to_billing}>
        {t("settings.upgrade_to_unlock" as TranslationKey)}
      </Button>
    </div>
  );
}
