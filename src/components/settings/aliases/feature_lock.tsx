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
import { SparklesIcon } from "@heroicons/react/24/outline";
import { UpgradeBtn } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";

export function prompt_upgrade(
  msg: string,
  resource?: string,
  feature?: string,
) {
  show_plan_limit_upgrade({
    message: msg,
    resource: resource ?? null,
    feature: feature ?? null,
  });
}

export function PaidPill({ className = "" }: { className?: string }) {
  const { t } = use_i18n();

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${className}`}
      style={{
        borderColor: "color-mix(in srgb, var(--accent-color) 35%, transparent)",
        backgroundColor:
          "color-mix(in srgb, var(--accent-color) 12%, transparent)",
        color: "var(--accent-color)",
      }}
    >
      <SparklesIcon className="h-2.5 w-2.5" />
      {t("settings.alias_paid_badge")}
    </span>
  );
}

export function FeatureLockOverlay({
  message,
  feature,
}: {
  message: string;
  feature?: string;
}) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-col items-start gap-2.5 rounded-lg border border-edge-secondary bg-surf-tertiary px-3.5 py-3">
      <p className="text-[13px] leading-5 text-txt-secondary">{message}</p>
      <UpgradeBtn
        size="sm"
        onClick={() => prompt_upgrade(message, undefined, feature)}
      >
        {t("settings.alias_feature_locked_upgrade_cta")}
      </UpgradeBtn>
    </div>
  );
}

export function LockedFeature({
  locked,
  message,
  feature,
  children,
}: {
  locked: boolean;
  message: string;
  feature?: string;
  children: React.ReactNode;
}) {
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none opacity-40 blur-[1px]"
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <LockedFeatureCard feature={feature} message={message} />
      </div>
    </div>
  );
}

function LockedFeatureCard({
  message,
  feature,
}: {
  message: string;
  feature?: string;
}) {
  const { t } = use_i18n();

  return (
    <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-xl border border-edge-secondary bg-surf-primary px-5 py-4 text-center shadow-lg">
      <p className="text-[13px] leading-5 text-txt-secondary">{message}</p>
      <UpgradeBtn
        size="sm"
        onClick={() => prompt_upgrade(message, undefined, feature)}
      >
        {t("settings.alias_feature_locked_upgrade_cta")}
      </UpgradeBtn>
    </div>
  );
}
