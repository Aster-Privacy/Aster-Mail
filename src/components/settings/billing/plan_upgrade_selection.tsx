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
import type { TranslationKey } from "@/lib/i18n";
import type { AvailablePlan } from "@/services/api/billing";

import { useState, useEffect, useCallback } from "react";
import { ArrowTopRightOnSquareIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { pricing_comparison_url } from "@/lib/canonical_urls";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import {
  get_available_plans,
  format_price,
  start_hosted_checkout,
} from "@/services/api/billing";
import { create_family_group } from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import {
  PLAN_TIERS,
  FAMILY_PLAN_TIERS,
  FAMILY_PLAN_DUO_FEATURES,
  FAMILY_PLAN_FAMILY_FEATURES,
  type PlanTier,
  type FamilyPlanTier,
  convert_cents,
  detect_currency_from_locale,
  SUPPORTED_CURRENCIES,
  CURRENCY_STORAGE_KEY,
} from "@/components/settings/billing/billing_constants";

type TFunc = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface FeatureRow {
  on: boolean;
  text: React.ReactNode;
}

function bold(text: string): React.ReactNode {
  return <strong className="font-bold">{text}</strong>;
}

function with_bold(prefix: string, rest: string): React.ReactNode {
  return (
    <>
      {bold(prefix)} {rest}
    </>
  );
}

const TIER_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  star: "auth.plan_star_description",
  nova: "auth.plan_nova_description",
  supernova: "auth.plan_supernova_description",
};

function feature_list_for_tier(tier_id: string, t: TFunc): FeatureRow[] {
  const unlimited = t("settings.unlimited");

  if (tier_id === "star") {
    return [
      { on: true, text: with_bold("50 GB", t("settings.encrypted_storage_suffix")) },
      { on: true, text: with_bold("15", t("settings.email_aliases_suffix")) },
      { on: true, text: with_bold("5", t("settings.custom_domains_suffix")) },
      { on: true, text: with_bold("50 MB", t("settings.attachments_suffix")) },
      { on: true, text: with_bold(unlimited, t("settings.mail_rules_suffix")) },
      { on: true, text: t("settings.f_e2ee") },
      { on: true, text: t("settings.f_zero_knowledge") },
      { on: true, text: t("settings.f_tracker_protection_long") },
      { on: true, text: t("settings.plan_f_alias_avatars") },
      { on: true, text: t("settings.plan_f_catch_all") },
      { on: true, text: t("settings.f_auto_forward") },
      { on: true, text: t("settings.plan_f_support_priority") },
      { on: true, text: t("settings.plan_f_imap_smtp_bridge") },
      { on: false, text: t("settings.f_folder_lock") },
      { on: false, text: t("settings.plan_f_smart_folders") },
      { on: false, text: t("settings.lockdown_title") },
      { on: false, text: t("settings.plan_f_read_receipts") },
    ];
  }
  if (tier_id === "nova") {
    return [
      { on: true, text: with_bold("500 GB", t("settings.encrypted_storage_suffix")) },
      { on: true, text: with_bold(unlimited, t("settings.email_aliases_suffix")) },
      { on: true, text: with_bold("30", t("settings.custom_domains_suffix")) },
      { on: true, text: with_bold("100 MB", t("settings.attachments_suffix")) },
      { on: true, text: with_bold(unlimited, t("settings.mail_rules_suffix")) },
      { on: true, text: t("settings.f_e2ee") },
      { on: true, text: t("settings.f_zero_knowledge") },
      { on: true, text: t("settings.f_tracker_protection_long") },
      { on: true, text: t("settings.plan_f_alias_avatars") },
      { on: true, text: t("settings.plan_f_catch_all") },
      { on: true, text: t("settings.f_auto_forward") },
      { on: true, text: t("settings.plan_f_support_priority") },
      { on: true, text: t("settings.plan_f_imap_smtp_bridge") },
      { on: true, text: t("settings.f_folder_lock") },
      { on: true, text: t("settings.plan_f_smart_folders") },
      { on: true, text: t("settings.lockdown_title") },
      { on: false, text: t("settings.plan_f_read_receipts") },
    ];
  }

  return [
    { on: true, text: with_bold("5 TB", t("settings.encrypted_storage_suffix")) },
    { on: true, text: with_bold(unlimited, t("settings.email_aliases_suffix")) },
    { on: true, text: with_bold(unlimited, t("settings.custom_domains_suffix")) },
    { on: true, text: with_bold("250 MB", t("settings.attachments_suffix")) },
    { on: true, text: with_bold(unlimited, t("settings.mail_rules_suffix")) },
    { on: true, text: t("settings.f_e2ee") },
    { on: true, text: t("settings.f_zero_knowledge") },
    { on: true, text: t("settings.f_tracker_protection_long") },
    { on: true, text: t("settings.plan_f_alias_avatars") },
    { on: true, text: t("settings.plan_f_catch_all") },
    { on: true, text: t("settings.f_auto_forward") },
    { on: true, text: t("settings.plan_f_support_priority") },
    { on: true, text: t("settings.plan_f_imap_smtp_bridge") },
    { on: true, text: t("settings.f_folder_lock") },
    { on: true, text: t("settings.plan_f_smart_folders") },
    { on: true, text: t("settings.lockdown_title") },
    { on: true, text: t("settings.plan_f_read_receipts") },
  ];
}

const CHECK_SVG = (
  <svg
    fill="none"
    height="18"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    width="18"
  >
    <path
      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CROSS_SVG = (
  <svg
    fill="none"
    height="18"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    width="18"
  >
    <path
      d="M9.75 9.75 14.25 14.25M14.25 9.75 9.75 14.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface PlanUpgradeSelectionProps {
  heading: string;
  subheading: string;
  back_label: string;
  on_back: () => void;
}

export function PlanUpgradeSelection({
  heading,
  subheading,
  back_label,
  on_back,
}: PlanUpgradeSelectionProps) {
  const { t } = use_i18n();
  const [plan_type, set_plan_type] = useState<"individual" | "family">(
    "individual",
  );
  const [billing_period, set_billing_period] = useState<"monthly" | "yearly">(
    "yearly",
  );
  const [currency, set_currency] = useState<string>("usd");
  const [plans, set_plans] = useState<AvailablePlan[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_finalizing, set_is_finalizing] = useState(false);
  const [pending_tier, set_pending_tier] = useState<{
    tier: PlanTier;
    plan: AvailablePlan;
  } | null>(null);
  const [crypto_tier, set_crypto_tier] = useState<{
    tier: PlanTier;
    plan: AvailablePlan;
  } | null>(null);
  const [pending_family_tier, set_pending_family_tier] =
    useState<FamilyPlanTier | null>(null);
  const [crypto_family_tier, set_crypto_family_tier] =
    useState<FamilyPlanTier | null>(null);

  useEffect(() => {
    set_currency(detect_currency_from_locale());
  }, []);

  useEffect(() => {
    const handle_page_show = (e: PageTransitionEvent) => {
      if (e.persisted) {
        set_is_finalizing(false);
        set_pending_tier(null);
        set_crypto_tier(null);
        set_pending_family_tier(null);
        set_crypto_family_tier(null);
      }
    };

    window.addEventListener("pageshow", handle_page_show);

    return () => window.removeEventListener("pageshow", handle_page_show);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await get_available_plans();

      if (!cancelled) {
        set_plans(res.data?.plans ?? []);
        set_is_loading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const billing_interval: "month" | "year" =
    billing_period === "yearly" ? "year" : "month";

  const handle_currency_change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;

    set_currency(next);
    localStorage.setItem(CURRENCY_STORAGE_KEY, next);
  };

  const handle_select_tier = useCallback(
    (tier: PlanTier) => {
      const api_plan = plans.find((p) => p.code === tier.id);

      if (!api_plan) return;
      set_pending_tier({ tier, plan: api_plan });
    },
    [plans],
  );

  const handle_pay_with_card = useCallback(async () => {
    if (!pending_tier) return;

    const tier = pending_tier;

    set_pending_tier(null);
    set_is_finalizing(true);

    const result = await start_hosted_checkout(
      tier.plan.code,
      billing_interval,
      currency,
    );

    if (!result.ok) {
      set_is_finalizing(false);
      show_toast(t("settings.failed_checkout"), "error");

      return;
    }

    // On web, start_hosted_checkout navigates this tab to Stripe and the
    // overlay is torn down with the page. On desktop, checkout opens in an
    // external browser and this window stays put, so clear the overlay here
    // instead of leaving it spinning forever.
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      set_is_finalizing(false);
    }
  }, [pending_tier, billing_interval, currency, t]);

  const handle_pay_with_crypto = useCallback(() => {
    if (!pending_tier) return;
    set_crypto_tier(pending_tier);
    set_pending_tier(null);
  }, [pending_tier]);

  const handle_family_card = useCallback(async () => {
    if (!pending_family_tier) return;
    const tier = pending_family_tier;

    set_pending_family_tier(null);
    set_is_finalizing(true);

    const res = await create_family_group(tier.id, billing_interval);

    if (res.data?.checkout_url) {
      try {
        const parsed = new URL(res.data.checkout_url);

        if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
        window.location.href = parsed.toString();
      } catch {
        set_is_finalizing(false);
        show_toast(t("settings.failed_checkout"), "error");
      }
    } else {
      set_is_finalizing(false);
      show_toast(t("settings.failed_checkout"), "error");
    }
  }, [pending_family_tier, billing_interval, t]);

  const handle_family_crypto = useCallback(() => {
    if (!pending_family_tier) return;
    set_crypto_family_tier(pending_family_tier);
    set_pending_family_tier(null);
  }, [pending_family_tier]);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-surf-primary">
      <div className="min-h-full flex flex-col items-center px-4 py-10">
        <img
          alt="Aster"
          className="h-10 mb-6"
          decoding="async"
          src="/text_logo.png"
        />

        <h1 className="text-xl font-semibold text-txt-primary text-center">
          {heading}
        </h1>
        <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center max-w-md">
          {subheading}
        </p>

        <div className="flex flex-col items-center gap-3 mt-6">
          <div className="inline-flex rounded-full p-[5px] gap-1 bg-surf-secondary border border-edge-secondary">
            {(["individual", "family"] as const).map((type) => {
              const active = plan_type === type;

              return (
                <button
                  key={type}
                  className="flex items-center gap-1.5 px-[18px] py-[8px] rounded-full text-[13px] font-medium transition-colors"
                  style={{
                    backgroundColor: active
                      ? "var(--accent-blue)"
                      : "transparent",
                    color: active ? "#fff" : "var(--text-tertiary)",
                  }}
                  type="button"
                  onClick={() => set_plan_type(type)}
                >
                  {type === "family" && <UserGroupIcon className="w-4 h-4" />}
                  {type === "individual"
                    ? t("settings.plan_type_individual")
                    : t("settings.plan_type_family")}
                </button>
              );
            })}
          </div>

          <div
            className="inline-flex items-center rounded-full p-[5px] gap-1 bg-surf-secondary border border-edge-secondary"
            role="tablist"
          >
            {(["yearly", "monthly"] as const).map((p) => {
              const active = billing_period === p;

              return (
                <button
                  key={p}
                  className="px-[18px] py-[8px] rounded-full text-[13px] font-medium transition-colors"
                  role="tab"
                  style={{
                    backgroundColor: active
                      ? "var(--accent-blue)"
                      : "transparent",
                    color: active ? "#ffffff" : "var(--text-tertiary)",
                  }}
                  type="button"
                  onClick={() =>
                    set_billing_period((prev) =>
                      prev === "yearly" ? "monthly" : "yearly",
                    )
                  }
                >
                  {p === "yearly"
                    ? t("settings.billing_yearly")
                    : t("settings.billing_monthly")}
                </button>
              );
            })}
          </div>
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
        ) : plan_type === "family" ? (
          <div className="w-full grid gap-5 mt-10 md:grid-cols-2 max-w-3xl items-stretch">
            {FAMILY_PLAN_TIERS.map((tier) => {
              const price_cents =
                billing_period === "yearly"
                  ? tier.yearly_cents
                  : tier.monthly_cents;
              const features =
                tier.max_members === 2
                  ? FAMILY_PLAN_DUO_FEATURES
                  : FAMILY_PLAN_FAMILY_FEATURES;

              return (
                <div
                  key={tier.id}
                  className="relative rounded-3xl border flex flex-col gap-6 p-7 transition-colors duration-300 hover:border-edge-primary"
                  style={{
                    borderColor: tier.is_recommended
                      ? "var(--accent-blue)"
                      : "var(--border-primary)",
                    backgroundColor: tier.is_recommended
                      ? "var(--accent-blue-subtle, var(--bg-hover))"
                      : "var(--bg-hover)",
                  }}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <UserGroupIcon className="w-5 h-5 text-txt-primary" />
                      <h3 className="text-lg font-bold text-txt-primary">
                        {tier.name}
                      </h3>
                    </div>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[40px] font-bold leading-none tracking-tight text-txt-primary">
                        {format_price(
                          convert_cents(price_cents, currency),
                          currency,
                        )}
                      </span>
                      <span className="text-sm text-txt-muted">
                        {billing_period === "monthly"
                          ? t("settings.per_month_short")
                          : t("settings.per_year_short")}
                      </span>
                      {billing_period === "yearly" && (
                        <span
                          className="ml-1 px-2 py-[3px] rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                          style={{ backgroundColor: "var(--accent-blue)" }}
                        >
                          {tier.savings_label}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed text-txt-tertiary">
                      {tier.max_members === 2
                        ? t("settings.family_duo_tagline")
                        : t("settings.family_plan_tagline")}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-3 flex-1">
                    {features.map((feat, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-[13px] leading-snug"
                        style={{
                          color: feat.on
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                        }}
                      >
                        <span
                          className="shrink-0 mt-[1px]"
                          style={{
                            color: feat.on ? "var(--accent-blue)" : "#dc2626",
                          }}
                        >
                          {feat.on ? CHECK_SVG : CROSS_SVG}
                        </span>
                        <span className="flex-1">{feat.label}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    disabled={is_finalizing}
                    size="xl"
                    variant={tier.is_recommended ? "depth" : "outline"}
                    onClick={() => set_pending_family_tier(tier)}
                  >
                    {t("auth.plan_select")}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full grid gap-5 mt-10 md:grid-cols-3 max-w-5xl items-stretch">
            {PLAN_TIERS.map((tier) => {
              const cents =
                billing_period === "yearly"
                  ? tier.yearly_cents
                  : tier.monthly_cents;
              const display_price = format_price(
                convert_cents(cents, currency),
                currency,
              );
              const saves =
                billing_period === "yearly" ? tier.savings_cents : 0;
              const has_api_plan = plans.some((p) => p.code === tier.id);
              const features = feature_list_for_tier(tier.id, t);
              const description = t(TIER_DESCRIPTION_KEYS[tier.id]);

              return (
                <div
                  key={tier.id}
                  className="relative rounded-3xl border flex flex-col gap-6 p-7 transition-colors duration-300 hover:border-edge-primary"
                  style={{
                    borderColor: tier.is_recommended
                      ? "var(--accent-blue)"
                      : "var(--border-primary)",
                    backgroundColor: tier.is_recommended
                      ? "var(--accent-blue-subtle, var(--bg-hover))"
                      : "var(--bg-hover)",
                  }}
                >
                  <div className="flex flex-col gap-3">
                    <h3 className="text-lg font-bold leading-tight text-txt-primary">
                      {tier.name}
                    </h3>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[40px] font-bold leading-none tracking-tight text-txt-primary">
                        {display_price}
                      </span>
                      <span className="text-sm text-txt-muted">
                        {billing_period === "monthly"
                          ? t("settings.per_month_short")
                          : t("settings.per_year_short")}
                      </span>
                      {saves > 0 && (
                        <span
                          className="ml-1 px-2 py-[3px] rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                          style={{ backgroundColor: "var(--accent-blue)" }}
                        >
                          {t("settings.save_yearly", {
                            amount: format_price(
                              convert_cents(saves, currency),
                              currency,
                            ),
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed text-txt-tertiary">
                      {description}
                    </p>
                  </div>

                  <ul className="flex flex-col gap-3 flex-1">
                    {features.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-[13px] leading-snug"
                        style={{
                          color: f.on
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                        }}
                      >
                        <span
                          className="shrink-0 mt-[1px]"
                          style={{
                            color: f.on ? "var(--accent-blue)" : "#dc2626",
                          }}
                        >
                          {f.on ? CHECK_SVG : CROSS_SVG}
                        </span>
                        <span className="flex-1">{f.text}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    disabled={!has_api_plan || is_finalizing}
                    size="xl"
                    variant={tier.is_recommended ? "depth" : "outline"}
                    onClick={() => handle_select_tier(tier)}
                  >
                    {t("auth.plan_select")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {!is_loading && (
          <div className="w-full flex flex-col items-center mt-8 mb-4 gap-3">
            <Button as_child variant="outline">
              <a
                href={pricing_comparison_url()}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span>{t("auth.plan_view_full_features")}</span>
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </a>
            </Button>
            <button
              className="text-sm font-medium hover:underline disabled:opacity-60"
              disabled={is_finalizing}
              style={{ color: "var(--text-tertiary)" }}
              type="button"
              onClick={on_back}
            >
              {back_label}
            </button>
          </div>
        )}

        {is_finalizing && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          >
            <div className="flex flex-col items-center gap-3">
              <Spinner size="lg" />
            </div>
          </div>
        )}

        {pending_tier && (
          <PlanPaymentMethodModal
            busy={is_finalizing}
            on_choose_card={handle_pay_with_card}
            on_choose_crypto={handle_pay_with_crypto}
            on_close={() => set_pending_tier(null)}
            open={!!pending_tier}
            plan_name={pending_tier.tier.name}
          />
        )}

        {crypto_tier && (
          <CryptoTermModal
            is_open={!!crypto_tier}
            monthly_price_cents={crypto_tier.tier.monthly_cents}
            on_close={() => set_crypto_tier(null)}
            plan_code={crypto_tier.plan.code}
            plan_name={crypto_tier.tier.name}
            preferred_currency={currency}
            yearly_price_cents={crypto_tier.tier.yearly_cents}
          />
        )}

        {pending_family_tier && (
          <PlanPaymentMethodModal
            busy={is_finalizing}
            on_choose_card={handle_family_card}
            on_choose_crypto={handle_family_crypto}
            on_close={() => set_pending_family_tier(null)}
            open={!!pending_family_tier}
            plan_name={pending_family_tier.name}
          />
        )}

        {crypto_family_tier && (
          <CryptoTermModal
            is_open={!!crypto_family_tier}
            monthly_price_cents={crypto_family_tier.monthly_cents}
            on_close={() => set_crypto_family_tier(null)}
            plan_code={crypto_family_tier.id}
            plan_name={crypto_family_tier.name}
            preferred_currency={currency}
            yearly_price_cents={crypto_family_tier.yearly_cents}
          />
        )}
      </div>
    </div>
  );
}
