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
import { UpgradeBtn } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
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

export function prompt_alias_limit_upgrade() {
  show_plan_limit_upgrade({ resource: "aliases" });
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
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-edge-secondary bg-surf-tertiary px-1.5 py-0.5 text-[11px] font-medium text-txt-muted ${className}`}
    >
      <LockClosedIcon className="h-3 w-3" />
      {t("settings.requires_plan", { plan: tier.name })}
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
    <div className="relative min-h-[196px] overflow-hidden rounded-xl">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none opacity-[0.12] blur-[6px] saturate-0"
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--accent-color) 7%, var(--bg-secondary)) 0%, var(--bg-secondary) 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <LockedFeatureCard feature={feature} message={message} />
      </div>
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
    <div
      className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border px-6 py-5 text-center"
      style={{
        borderColor: "color-mix(in srgb, var(--accent-color) 24%, transparent)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--accent-color) 12%, var(--bg-tertiary)) 0%, var(--bg-tertiary) 100%)",
        boxShadow: "0 12px 32px color-mix(in srgb, #000000 28%, transparent)",
      }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--accent-color) 18%, transparent)",
          boxShadow:
            "inset 0 0 0 1px color-mix(in srgb, var(--accent-color) 30%, transparent)",
        }}
      >
        <LockClosedIcon
          className="h-5 w-5"
          style={{ color: "var(--accent-color)" }}
        />
      </span>
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
