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
import type { UseRegistrationReturn } from "@/components/register/hooks/use_registration";
import type { AvailablePlan } from "@/services/api/billing";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  CheckIcon,
  XMarkIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import { Button, SegmentedToggle } from "@aster/ui";

import { Logo } from "@/components/auth/auth_styles";
import { Spinner } from "@/components/ui/spinner";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import { CheckoutModal } from "@/components/settings/checkout_modal";
import {
  get_plan_comparison_rows,
  type ComparisonRow,
} from "@/components/settings/billing/plan_comparison_table";
import {
  get_available_plans,
  format_price,
  type AvailablePlansResponse,
} from "@/services/api/billing";
import {
  PLAN_TIERS,
  type PlanTier,
  convert_cents,
  detect_currency_from_locale,
  SUPPORTED_CURRENCIES,
  CURRENCY_STORAGE_KEY,
} from "@/components/settings/billing/billing_constants";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";

interface RegisterStepPlanSelectionProps {
  reg: UseRegistrationReturn;
}

interface SelectedCheckout {
  plan: AvailablePlan;
  tier: PlanTier;
  billing_interval: "month" | "year";
}

let plans_promise_cache: Promise<{
  data?: AvailablePlansResponse;
  error?: string;
}> | null = null;

export function prefetch_plans(): void {
  if (plans_promise_cache) return;
  plans_promise_cache = get_available_plans().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : "fetch_failed",
  }));
}

async function load_plans(): Promise<AvailablePlan[]> {
  if (!plans_promise_cache) prefetch_plans();
  const res = await plans_promise_cache!;

  return res.data?.plans ?? [];
}

export const RegisterStepPlanSelection = ({
  reg,
}: RegisterStepPlanSelectionProps) => {
  const { t } = reg;
  const [billing_period, set_billing_period] = useState<"monthly" | "yearly">(
    "yearly",
  );
  const [currency, set_currency] = useState<string>("usd");
  const [plans, set_plans] = useState<AvailablePlan[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [checkout, set_checkout] = useState<SelectedCheckout | null>(null);
  const [is_finalizing, set_is_finalizing] = useState(false);
  const [show_compare, set_show_compare] = useState(false);

  useEffect(() => {
    set_currency(detect_currency_from_locale());
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const loaded = await load_plans();

      if (!cancelled) {
        set_plans(loaded);
        set_is_loading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handle_currency_change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;

    set_currency(next);
    localStorage.setItem(CURRENCY_STORAGE_KEY, next);
  };

  const billing_interval: "month" | "year" =
    billing_period === "yearly" ? "year" : "month";

  const handle_select_tier = useCallback(
    (tier: PlanTier) => {
      const api_plan = plans.find(
        (p) =>
          p.code === tier.id &&
          (p.billing_period === billing_interval || !p.billing_period),
      );

      if (!api_plan) {
        return;
      }

      set_checkout({ plan: api_plan, tier, billing_interval });
    },
    [plans, billing_interval],
  );

  const handle_continue_free = useCallback(async () => {
    if (is_finalizing) return;
    set_is_finalizing(true);
    await reg.finalize_registration();
  }, [is_finalizing, reg]);

  const handle_checkout_success = useCallback(async () => {
    set_is_finalizing(true);
    await reg.finalize_registration();
  }, [reg]);

  const price_display_for_checkout = useMemo(() => {
    if (!checkout) return "";
    const cents =
      checkout.billing_interval === "year"
        ? checkout.tier.yearly_cents
        : checkout.tier.monthly_cents;

    return format_price(convert_cents(cents, currency), currency);
  }, [checkout, currency]);

  return (
    <motion.div
      key="plan_selection"
      animate="animate"
      className="flex flex-col items-center w-full max-w-md md:max-w-6xl px-4"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      <h1 className="text-xl font-semibold mt-6 text-txt-primary">
        {t("auth.plan_selection_title")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center max-w-md">
        {t("auth.plan_selection_subtitle")}
      </p>

      <div className="flex items-center justify-center mt-5 gap-3">
        <SegmentedToggle
          name="registration_billing_period"
          on_change={(v) => set_billing_period(v as "monthly" | "yearly")}
          options={[
            { value: "monthly", label: t("settings.billing_monthly") },
            { value: "yearly", label: t("settings.billing_yearly") },
          ]}
          value={billing_period}
        />
      </div>

      <div className="flex items-center justify-center gap-2 mt-3">
        <p className="text-xs text-txt-muted">
          {t("settings.prices_in_usd_note")}
        </p>
        <select
          className="text-xs bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1 text-txt-secondary cursor-pointer outline-none focus:border-blue-500 transition-colors"
          value={currency}
          onChange={handle_currency_change}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {is_loading ? (
        <div className="flex items-center gap-2 mt-10 text-txt-tertiary">
          <Spinner size="md" />
          <span className="text-sm">{t("auth.plan_loading")}</span>
        </div>
      ) : (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <div
            className="relative rounded-2xl border-2 overflow-hidden flex flex-col"
            style={{
              borderColor: "var(--border-secondary)",
              backgroundColor: "var(--bg-tertiary)",
            }}
          >
            <div className="px-5 pt-6 pb-4 text-center">
              <h4 className="text-lg font-bold text-txt-primary">
                {t("auth.plan_free_name")}
              </h4>
              <div className="mt-2">
                <span className="text-3xl font-bold text-txt-primary">
                  {format_price(0, currency)}
                </span>
                <span className="text-sm text-txt-muted">
                  {billing_period === "monthly"
                    ? t("settings.per_month_short")
                    : t("settings.per_year_short")}
                </span>
              </div>
              <p className="text-xs text-txt-muted mt-1.5 min-h-[1rem]">
                {t("auth.plan_free_tagline")}
              </p>
              <Button
                className="w-full mt-4"
                disabled={is_finalizing}
                variant="primary"
                onClick={handle_continue_free}
              >
                {is_finalizing ? (
                  <Spinner size="xs" />
                ) : (
                  t("auth.plan_free_cta")
                )}
              </Button>
            </div>
            <div
              className="px-5 pb-5 flex-1"
              style={{ borderTop: "1px solid var(--border-secondary)" }}
            >
              <div className="space-y-2 pt-4">
                {plan_bullets("free", t).map((feature, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckIcon
                      className="w-3.5 h-3.5 flex-shrink-0"
                      strokeWidth={2.5}
                      style={{ color: "var(--accent-blue)" }}
                    />
                    <span className="text-xs text-txt-secondary">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {PLAN_TIERS.map((tier) => {
            const cents =
              billing_period === "yearly"
                ? tier.yearly_cents
                : tier.monthly_cents;
            const display_price = format_price(
              convert_cents(cents, currency),
              currency,
            );
            const saves = billing_period === "yearly" ? tier.savings_cents : 0;
            const has_api_plan = plans.some(
              (p) =>
                p.code === tier.id &&
                (p.billing_period === billing_interval || !p.billing_period),
            );

            return (
              <div
                key={tier.id}
                className="relative rounded-2xl border-2 overflow-hidden flex flex-col"
                style={{
                  borderColor: tier.is_recommended
                    ? "var(--accent-blue)"
                    : "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                }}
              >
                {tier.is_recommended && (
                  <div
                    className="absolute top-0 right-0 px-2.5 py-1 text-[10px] font-semibold rounded-bl-xl"
                    style={{
                      backgroundColor: "var(--accent-blue)",
                      color: "#fff",
                    }}
                  >
                    {t("auth.plan_recommended")}
                  </div>
                )}

                <div className="px-5 pt-6 pb-4 text-center">
                  <h4 className="text-lg font-bold text-txt-primary">
                    {tier.name}
                  </h4>

                  <div className="mt-2">
                    <span className="text-3xl font-bold text-txt-primary">
                      {display_price}
                    </span>
                    <span className="text-sm text-txt-muted">
                      {billing_period === "monthly"
                        ? t("settings.per_month_short")
                        : t("settings.per_year_short")}
                    </span>
                  </div>

                  <p
                    className="text-xs font-medium mt-1.5 min-h-[1rem]"
                    style={{
                      color: saves > 0 ? "var(--color-success)" : "transparent",
                    }}
                  >
                    {saves > 0
                      ? t("settings.save_yearly", {
                          amount: format_price(
                            convert_cents(saves, currency),
                            currency,
                          ),
                        })
                      : "\u00A0"}
                  </p>

                  <Button
                    className="w-full mt-4"
                    disabled={!has_api_plan || is_finalizing}
                    variant={tier.is_recommended ? "depth" : "primary"}
                    onClick={() => handle_select_tier(tier)}
                  >
                    {t("auth.plan_select")}
                  </Button>
                </div>

                <div
                  className="px-5 pb-5 flex-1"
                  style={{ borderTop: "1px solid var(--border-secondary)" }}
                >
                  <div className="space-y-2 pt-4">
                    {plan_bullets(tier.id, t).map((feature, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckIcon
                          className="w-3.5 h-3.5 flex-shrink-0"
                          strokeWidth={2.5}
                          style={{ color: "var(--accent-blue)" }}
                        />
                        <span className="text-xs text-txt-secondary">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!is_loading && (
        <div className="w-full flex flex-col items-center mt-8 mb-4">
          <button
            className="text-sm text-txt-secondary hover:underline underline-offset-4 bg-transparent border-0 p-0 cursor-pointer"
            type="button"
            onClick={() => set_show_compare(true)}
          >
            {t("auth.plan_view_full_features")}
          </button>
          <p className="mt-4 text-xs text-txt-muted text-center max-w-md">
            {t("auth.plan_footer_reassurance")}
          </p>
        </div>
      )}

      <Modal
        is_open={show_compare}
        on_close={() => set_show_compare(false)}
        size="full"
      >
        <ModalHeader>
          <div className="flex items-center gap-2">
            <TableCellsIcon className="w-5 h-5 text-txt-primary" />
            <h3 className="text-base font-semibold text-txt-primary">
              {t("settings.compare_plans")}
            </h3>
          </div>
        </ModalHeader>
        <ModalBody>
          <ComparisonTableView rows={get_plan_comparison_rows(t)} t={t} />
        </ModalBody>
      </Modal>

      {checkout && (
        <CheckoutModal
          billing_interval={checkout.billing_interval}
          currency={currency}
          on_close={() => set_checkout(null)}
          on_success={handle_checkout_success}
          open={!!checkout}
          plan_code={checkout.plan.code}
          plan_name={checkout.tier.name}
          price_cents={
            checkout.billing_interval === "year"
              ? checkout.tier.yearly_cents
              : checkout.tier.monthly_cents
          }
          price_display={price_display_for_checkout}
        />
      )}
    </motion.div>
  );
};

function plan_bullets(
  tier_id: string,
  t: UseRegistrationReturn["t"],
): string[] {
  if (tier_id === "free") {
    return [
      t("settings.plan_f_storage", { value: "10 GB" }),
      t("settings.plan_f_aliases", { value: "5" }),
      t("settings.plan_f_domains", { value: "3" }),
      t("settings.plan_f_templates", { value: "3" }),
      t("settings.plan_f_imap_smtp"),
    ];
  }
  if (tier_id === "star") {
    return [
      t("settings.plan_f_storage", { value: "15 GB" }),
      t("settings.plan_f_aliases", { value: "15" }),
      t("settings.plan_f_domains", { value: "5" }),
      t("settings.plan_f_templates", { value: "10" }),
      t("settings.plan_f_vacation_reply"),
    ];
  }
  if (tier_id === "nova") {
    return [
      t("settings.plan_f_storage", { value: "100 GB" }),
      t("settings.plan_f_aliases", { value: "50" }),
      t("settings.plan_f_domains", { value: "25" }),
      t("settings.plan_f_templates", { value: t("settings.unlimited") }),
      t("settings.plan_f_smart_folders"),
    ];
  }

  return [
    t("settings.plan_f_storage", { value: "1 TB" }),
    t("settings.plan_f_aliases", { value: t("settings.unlimited") }),
    t("settings.plan_f_domains", { value: t("settings.unlimited") }),
    t("settings.plan_f_read_receipts"),
    t("settings.plan_f_support_priority"),
  ];
}

interface ComparisonTableViewProps {
  rows: ComparisonRow[];
  t: UseRegistrationReturn["t"];
}

function ComparisonTableView({ rows, t }: ComparisonTableViewProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-edge-secondary">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ backgroundColor: "var(--bg-tertiary)" }}>
            <th className="text-left px-3 py-2.5 font-semibold text-txt-primary border-b border-edge-secondary min-w-[140px]">
              {t("settings.feature")}
            </th>
            <th className="text-center px-2 py-2.5 font-semibold text-txt-muted border-b border-edge-secondary">
              Free
            </th>
            <th className="text-center px-2 py-2.5 font-semibold text-txt-primary border-b border-edge-secondary">
              Star
            </th>
            <th
              className="text-center px-2 py-2.5 font-semibold border-b border-edge-secondary"
              style={{ color: "var(--accent-blue)" }}
            >
              Nova
            </th>
            <th className="text-center px-2 py-2.5 font-semibold text-txt-primary border-b border-edge-secondary">
              Supernova
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{
                backgroundColor:
                  i % 2 === 0 ? "transparent" : "var(--bg-tertiary)",
              }}
            >
              <td className="px-3 py-2 text-txt-secondary border-b border-edge-secondary/50">
                {row.label}
              </td>
              {(["free", "star", "nova", "supernova"] as const).map((plan) => (
                <td
                  key={plan}
                  className="text-center px-2 py-2 border-b border-edge-secondary/50"
                >
                  {row[plan] === "✓" ? (
                    <CheckIcon
                      className="w-4 h-4 mx-auto"
                      strokeWidth={2.5}
                      style={{ color: "var(--color-success)" }}
                    />
                  ) : row[plan] === "-" ? (
                    <XMarkIcon className="w-3.5 h-3.5 mx-auto text-txt-muted/40" />
                  ) : (
                    <span className="text-txt-primary font-medium">
                      {row[plan]}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
