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
import { Island, UpgradeBtn } from "@aster/ui";

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

  const centered = variant === "centered";

  return (
    <div
      className={
        centered ? "flex min-h-[60vh] items-center justify-center px-4" : ""
      }
    >
      <Island
        className={centered ? "w-full max-w-[440px]" : "w-full"}
        padding="none"
      >
        <div
          className={`flex flex-col items-center text-center ${
            centered ? "px-8 py-10" : "px-6 py-8"
          }`}
        >
          <span
            aria-hidden="true"
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--accent-color) 12%, transparent)",
              color: "var(--accent-color)",
            }}
          >
            <LockClosedIcon className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <h3
            className={`font-semibold tracking-tight text-txt-primary ${
              centered ? "text-[19px] leading-6" : "text-[16px] leading-[22px]"
            }`}
          >
            {feature_name}
          </h3>
          <p className="mt-1.5 max-w-[380px] text-[14px] leading-5 text-txt-secondary">
            {description}
          </p>
          <UpgradeBtn
            className="mt-5 min-w-[180px]"
            size={centered ? "lg" : "md"}
            onClick={navigate_to_billing}
          >
            {t("settings.upgrade_to_unlock" as TranslationKey)}
          </UpgradeBtn>
          <p className="mt-2.5 text-[12.5px] text-txt-muted">
            {t("settings.available_on_plan" as TranslationKey, {
              plan: min_plan,
            })}
          </p>
        </div>
      </Island>
    </div>
  );
}
