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
  SparklesIcon,
  CreditCardIcon,
  ArrowRightIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Progress } from "@/components/ui/progress";
import {
  format_storage,
  format_price,
  format_date,
  type SubscriptionResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

interface CurrentPlanCardProps {
  subscription: SubscriptionResponse | null;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_percentage: number;
  is_over_limit: boolean;
  is_action_loading: boolean;
  has_payment_failed: boolean;
  grace_days_remaining: number;
  current_billing_interval: "month" | "year";
  on_scroll_to_plans: () => void;
  on_manage_billing: () => void;
  on_reactivate: () => void;
  on_manage_plan: () => void;
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
}: CurrentPlanCardProps) {
  const { t } = use_i18n();
  const is_paid_plan = subscription && subscription.plan.code !== "free";

  return (
    <>
      <div
        className="relative overflow-hidden rounded-2xl p-6"
        style={{
          backgroundColor: "#1d4ed8",
        }}
      >
        <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-end gap-2 pointer-events-none">
          <ShieldCheckIcon
            className="w-9 h-9 text-white/15"
            style={{ transform: "translateY(-18px) rotate(-12deg)" }}
          />
          <CreditCardIcon className="w-20 h-20 text-white/20" />
          <SparklesIcon
            className="w-11 h-11 text-white/12"
            style={{ transform: "translateY(-28px) rotate(15deg)" }}
          />
          <CircleStackIcon
            className="w-7 h-7 text-white/10"
            style={{ transform: "translateY(-6px) rotate(-8deg)" }}
          />
        </div>

        <div className="relative z-10">
          <h3
            className="text-lg font-bold text-white mb-1 tracking-tight"
            style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
          >
            {t("settings.billing_banner_title")}
          </h3>
          <p
            className="text-sm text-blue-100/70 mb-5 max-w-[320px]"
            style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
          >
            {t("settings.billing_banner_subtitle")}
          </p>
          <button
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white text-blue-900"
            style={{
              boxShadow:
                "0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.9) inset",
            }}
            onClick={on_scroll_to_plans}
          >
            {t("settings.billing_banner_cta")}
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {has_payment_failed && (
        <div
          className="p-4 rounded-lg border flex items-start gap-3 bg-surf-tertiary"
          style={{ borderColor: "var(--color-warning)" }}
        >
          <ExclamationTriangleIcon
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: "var(--color-warning)" }}
          />
          <div className="flex-1">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--color-warning)" }}
            >
              {t("settings.payment_failed_warning")}
            </p>
            <p className="text-xs mt-1 text-txt-muted">
              {t("settings.grace_period_remaining", {
                days: String(grace_days_remaining),
              })}
            </p>
            <Button
              className="mt-3"
              disabled={is_action_loading}
              size="sm"
              variant="outline"
              onClick={on_manage_billing}
            >
              {t("settings.update_payment_method")}
            </Button>
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
              <h4 className="text-base font-semibold text-txt-primary">
                {subscription?.plan.name || t("settings.free")}
              </h4>
              {is_paid_plan && subscription?.plan.description && (
                <p className="text-xs mt-1 text-txt-muted">
                  {subscription.plan.description}
                </p>
              )}
              {!is_paid_plan && (
                <p className="text-xs mt-1 text-txt-muted">
                  {t("settings.free_plan_description")}
                </p>
              )}
            </div>
            {is_paid_plan && subscription.current_period_end && (
              <div className="text-right">
                <span className="text-sm font-medium text-txt-secondary">
                  {format_price(subscription.plan.price_cents)}
                  <span className="text-xs font-normal text-txt-muted">
                    {subscription.plan.billing_period?.startsWith("year")
                      ? t("settings.per_year_short")
                      : t("settings.per_month_short")}
                  </span>
                </span>
                <p className="text-xs mt-0.5 text-txt-muted">
                  {t("settings.current_billing_interval", {
                    interval:
                      current_billing_interval === "year"
                        ? t("settings.billing_yearly").toLowerCase()
                        : t("settings.billing_monthly").toLowerCase(),
                  })}
                </p>
                <p className="text-xs mt-0.5 text-txt-muted">
                  {subscription.cancel_at_period_end
                    ? t("settings.cancels")
                    : t("settings.renews")}{" "}
                  {format_date(subscription.current_period_end)}
                </p>
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
            <Button
              className="w-full mt-4"
              size="xl"
              variant="depth"
              onClick={on_scroll_to_plans}
            >
              {t("settings.upgrade_for_more")}
              <ArrowRightIcon className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
