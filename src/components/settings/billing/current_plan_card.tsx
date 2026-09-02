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
import {
  ExclamationTriangleIcon,
  CreditCardIcon,
  ArrowRightIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";

import { Progress } from "@/components/ui/progress";
import {
  format_storage,
  format_price,
  format_date,
  type SubscriptionResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import {
  convert_cents,
  is_crypto_provider,
  PLAN_TIERS,
} from "@/components/settings/billing/billing_constants";
import { DEFAULT_RECOMMENDED_PLAN } from "@/components/settings/billing/plan_recommendation";
import type { PlanFeature } from "@/components/settings/billing/plan_card";
import { CrownIcon } from "@/components/ui/crown_icon";
import { describe_plan } from "@/utils/billing_description";

interface CurrentPlanCardProps {
  subscription: SubscriptionResponse | null;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_percentage: number;
  is_over_limit: boolean;
  is_action_loading: boolean;
  has_payment_failed: boolean;
  grace_days_remaining: number;
  current_billing_interval: "month" | "year" | "biennial";
  on_scroll_to_plans: () => void;
  on_manage_billing: () => void;
  on_reactivate: () => void;
  on_manage_plan: () => void;
  on_renew_with_crypto?: () => void;
  preferred_currency: string;
  upgrade_features?: PlanFeature[];
}

export function CurrentPlanCard({
  subscription,
  storage_used_bytes,
  storage_limit_bytes,
  storage_percentage,
  is_over_limit,
  is_action_loading,
  has_payment_failed,
  grace_days_remaining,
  current_billing_interval,
  on_scroll_to_plans,
  on_manage_billing,
  on_reactivate,
  on_manage_plan,
  on_renew_with_crypto,
  preferred_currency,
  upgrade_features,
}: CurrentPlanCardProps) {
  const { t } = use_i18n();
  const is_paid_plan = subscription && subscription.plan.code !== "free";
  const is_crypto = is_crypto_provider(subscription?.payment_provider);
  const upgrade_tier =
    PLAN_TIERS.find((tier) => tier.id === DEFAULT_RECOMMENDED_PLAN) ??
    PLAN_TIERS[0];
  const entry_price_label = format_price(
    convert_cents(
      Math.min(...PLAN_TIERS.map((tier) => tier.monthly_cents)),
      preferred_currency,
    ),
    preferred_currency,
  );
  const teaser_features = (upgrade_features ?? []).slice(0, 3);
  const plan_description = describe_plan(
    subscription?.plan.code,
    subscription?.plan.description,
    t,
  );

  return (
    <>
      {has_payment_failed && (
        <div className="p-4 rounded-lg flex items-start gap-3 bg-red-600">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-50" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-50">
              {t("settings.payment_failed_warning")}
            </p>
            <p className="text-xs mt-1 text-red-100">
              {t("settings.grace_period_remaining", {
                days: grace_days_remaining,
              })}
            </p>
            <button
              className="mt-3 inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-950 text-red-50 hover:bg-red-900 transition-colors disabled:opacity-50"
              disabled={is_action_loading}
              type="button"
              onClick={on_manage_billing}
            >
              {t("settings.update_payment_method")}
            </button>
          </div>
        </div>
      )}

      {is_over_limit && (
        <div
          className="p-4 rounded-lg border flex items-start gap-3 bg-surf-tertiary"
          style={{ borderColor: "var(--destructive)" }}
        >
          <ExclamationTriangleIcon
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: "var(--destructive)" }}
          />
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--destructive)" }}
            >
              {t("settings.storage_limit_exceeded")}
            </p>
            <p className="text-xs mt-1 text-txt-muted">
              {t("settings.storage_limit_description")}
            </p>
          </div>
        </div>
      )}

      <div>
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <CreditCardIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
              {t("settings.current_plan")}
            </h3>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="p-4 rounded-lg bg-surf-tertiary border border-edge-secondary">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-semibold text-txt-primary">
                  {subscription?.plan.name || t("settings.free")}
                </h4>
                {is_paid_plan && subscription?.active_discount_description && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/15 text-green-500">
                    {subscription.active_discount_description}
                  </span>
                )}
              </div>
              {is_paid_plan && plan_description && (
                <p className="text-xs mt-1 text-txt-muted">
                  {plan_description}
                </p>
              )}
              {!is_paid_plan && (
                <p className="text-xs mt-1 text-txt-muted">
                  {t("settings.free_plan_description")}
                </p>
              )}
            </div>
            {is_paid_plan && subscription.current_period_end && (
              <div className="text-end">
                <span className="text-sm font-medium text-txt-secondary">
                  {format_price(
                    convert_cents(
                      subscription.plan.price_cents,
                      preferred_currency,
                    ),
                    preferred_currency,
                  )}
                  <span className="text-xs font-normal text-txt-muted">
                    {current_billing_interval === "biennial"
                      ? t("settings.per_two_years")
                      : current_billing_interval === "year"
                        ? t("settings.per_year_short")
                        : t("settings.per_month_short")}
                  </span>
                </span>
                <p className="text-xs mt-0.5 text-txt-muted">
                  {t("settings.current_billing_interval", {
                    interval:
                      current_billing_interval === "biennial"
                        ? t("settings.biennial").toLowerCase()
                        : current_billing_interval === "year"
                          ? t("settings.billing_yearly").toLowerCase()
                          : t("settings.billing_monthly").toLowerCase(),
                  })}
                </p>
                {is_crypto ? (
                  <>
                    <p className="text-xs mt-0.5 text-txt-muted">
                      {t("settings.crypto_paid_until", {
                        date: format_date(
                          subscription.paid_until ||
                            subscription.current_period_end,
                        ),
                      })}
                    </p>
                    <div className="mt-1.5 flex justify-end">
                      <span
                        className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold text-center"
                        style={{
                          backgroundColor: "var(--color-warning)",
                          color: "#1c1400",
                        }}
                      >
                        {t("settings.crypto_no_renew_notice")}
                      </span>
                    </div>
                    {on_renew_with_crypto && (
                      <button
                        className="text-xs mt-1.5 font-medium text-blue-500 hover:text-blue-400 underline-offset-4 hover:underline"
                        type="button"
                        onClick={on_renew_with_crypto}
                      >
                        {t("settings.crypto_renew_link")}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs mt-0.5 text-txt-muted">
                    {subscription.cancel_at_period_end
                      ? t("settings.cancels")
                      : t("settings.renews")}{" "}
                    {format_date(subscription.current_period_end)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-txt-muted">
                {t("settings.storage")}
              </span>
              <span className="text-xs text-txt-secondary">
                {format_storage(storage_used_bytes)} /{" "}
                {format_storage(storage_limit_bytes)}
              </span>
            </div>
            <Progress
              className={`h-2 ${is_over_limit ? "[&>div]:bg-red-500" : ""}`}
              value={storage_percentage}
            />
          </div>

          {is_paid_plan ? (
            <div className="mt-4 pt-3 border-t border-edge-secondary space-y-2">
              {subscription.cancel_at_period_end ? (
                <Button
                  className="w-full"
                  disabled={is_action_loading}
                  variant="depth"
                  onClick={on_reactivate}
                >
                  {t("settings.reactivate")}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={is_action_loading}
                  variant="primary"
                  onClick={on_manage_plan}
                >
                  <Cog6ToothIcon className="w-4 h-4" />
                  {t("settings.manage_plan")}
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-4 pt-3 border-t border-edge-secondary">
              {teaser_features.length > 0 && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CrownIcon className="w-4 h-4 flex-shrink-0 text-txt-primary" />
                    <p className="text-sm font-semibold text-txt-primary">
                      {t("settings.free_upgrade_title", {
                        plan: upgrade_tier.name,
                      })}
                    </p>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        backgroundColor: "var(--accent-color)",
                        color: "var(--accent-fg, #ffffff)",
                      }}
                    >
                      {t("settings.plan_recommended")}
                    </span>
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {teaser_features.map((feature) => (
                      <li
                        key={feature.label}
                        className="flex items-start gap-2 text-xs text-txt-secondary"
                      >
                        <CheckCircleIcon
                          className="w-4 h-4 flex-shrink-0 mt-px"
                          style={{ color: "var(--accent-color)" }}
                        />
                        <span>{feature.label}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 text-xs text-txt-muted">
                    {t("settings.free_upgrade_price_note", {
                      price: entry_price_label,
                    })}
                  </p>
                </>
              )}
              <Button
                className="w-full mt-3"
                size="xl"
                variant="depth"
                onClick={on_scroll_to_plans}
              >
                {t("settings.upgrade_for_more")}
                <ArrowRightIcon className="w-4 h-4 ms-1 rtl:-scale-x-100" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
