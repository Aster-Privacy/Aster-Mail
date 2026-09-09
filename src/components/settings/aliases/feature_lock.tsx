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
import { LockClosedIcon } from "@heroicons/react/24/solid";
import { Badge, UpgradeBtn } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
import { show_alias_cap_upsell } from "@/stores/alias_cap_upsell_store";
import { min_plan_for_feature } from "@/components/settings/billing/billing_constants";

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

export function is_alias_limit_error(response: {
  error?: string | null;
  server_code?: string | null;
}): boolean {
  return (
    response.server_code === "PLAN_LIMIT_EXCEEDED" ||
    /alias limit/i.test(response.error ?? "")
  );
}

export function prompt_alias_limit_upgrade(opts?: {
  used?: number | null;
  limit?: number | null;
}) {
  show_alias_cap_upsell({
    used: opts?.used ?? null,
    limit: opts?.limit ?? null,
  });
}

export function RequiredPlanPill({
  feature,
  className = "",
}: {
  feature?: string;
  className?: string;
}) {
  const { t } = use_i18n();
  const tier = min_plan_for_feature(feature ?? null);

  if (!tier) return null;

  return (
    <Badge className={className} color="blue">
      {t("settings.requires_plan", { plan: tier.name })}
    </Badge>
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
    <div className="flex flex-col items-start gap-2.5 py-3">
      <RequiredPlanPill feature={feature} />
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
    <div className="flex min-h-[196px] items-center justify-center py-8">
      <LockedFeatureCard feature={feature} message={message} />
    </div>
  );
}

export function LockedFeatureCard({
  message,
  detail,
  feature,
}: {
  message: string;
  detail?: string;
  feature?: string;
}) {
  const { t } = use_i18n();

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
      <LockClosedIcon className="h-7 w-7 text-txt-muted" />
      <p className="text-sm leading-5 text-txt-primary">{message}</p>
      {detail && <p className="text-[13px] text-txt-muted">{detail}</p>}
      <RequiredPlanPill feature={feature} />
      <UpgradeBtn
        className="w-full"
        size="sm"
        onClick={() => prompt_upgrade(message, undefined, feature)}
      >
        {t("settings.alias_feature_locked_upgrade_cta")}
      </UpgradeBtn>
    </div>
  );
}
