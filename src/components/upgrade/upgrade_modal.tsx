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
import type { ChangeEvent } from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { LockClosedIcon, CheckCircleIcon } from "@heroicons/react/24/solid";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { Spinner } from "@/components/ui/spinner";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { request_cache } from "@/services/api/request_cache";
import {
  change_plan,
  format_price,
  start_hosted_checkout,
} from "@/services/api/billing";
import {
  CURRENCY_STORAGE_KEY,
  FAMILY_PLAN_DUO_FEATURES,
  FAMILY_PLAN_FAMILY_FEATURES,
  FAMILY_PLAN_TIERS,
  PLAN_TIERS,
  SUPPORTED_CURRENCIES,
  convert_cents,
  detect_currency_from_locale,
  min_plan_for_feature,
  type PlanTier,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import {
  PlanCard,
  Segmented,
  Tabs,
} from "@/components/settings/billing/plan_card";
import { PlanFeaturesModal } from "@/components/settings/billing/plan_features_modal";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { is_payment_navigation } from "@/lib/payment_navigation";
import { format_bytes } from "@/lib/utils";
import {
  close_upgrade_modal,
  is_on_auth_route,
  show_plan_limit_upgrade,
  show_storage_full_upgrade,
  use_upgrade_state,
  type UpgradeInterval,
  type UpgradeLimitKey,
} from "@/stores/upgrade_store";
import { checkout_error_text } from "@/components/settings/billing/checkout_error_text";

const LIMIT_LABEL_KEY: Record<UpgradeLimitKey, string> = {
  max_email_aliases: "settings.usage_aliases",
  max_custom_domains: "settings.usage_domains",
  max_contacts: "settings.usage_contacts",
  max_email_templates: "settings.usage_templates",
  max_html_signatures: "settings.usage_signatures",
  max_custom_filters: "settings.usage_filters",
  max_custom_categories: "settings.usage_custom_categories",
  max_linked_accounts: "settings.usage_linked_accounts",
  max_external_accounts: "settings.usage_external_accounts",
  generic: "settings.upgrade_generic_resource",
};

type HighlightKind = "storage" | "aliases" | "domains" | "extra";

interface PlanHighlight {
  kind: HighlightKind;
  label_key: string;
  info_key?: string;
}

const HIGHLIGHT_INFO_KEY: Record<HighlightKind, string> = {
  storage: "settings.zero_knowledge_storage_description",
  aliases: "settings.aliases_description",
  domains: "settings.domains_description",
  extra: "",
};

type PlanAudience = "individual" | "family";

const PLAN_HIGHLIGHTS: Record<string, PlanHighlight[]> = {
  star: [
    { kind: "storage", label_key: "settings.plan_feat_storage_50" },
    { kind: "aliases", label_key: "settings.plan_feat_aliases_15" },
    { kind: "domains", label_key: "settings.plan_feat_domains_5" },
    {
      kind: "extra",
      label_key: "settings.plan_feat_advanced_aliases",
      info_key: "settings.plan_desc_advanced_aliases",
    },
  ],
  nova: [
    { kind: "storage", label_key: "settings.plan_feat_storage_500" },
    { kind: "aliases", label_key: "settings.plan_feat_aliases_unlimited" },
    { kind: "domains", label_key: "settings.plan_feat_domains_30" },
    {
      kind: "extra",
      label_key: "settings.plan_feat_smart_folders",
      info_key: "settings.plan_tip_smart_folders",
    },
  ],
  supernova: [
    { kind: "storage", label_key: "settings.plan_feat_storage_5tb" },
    { kind: "aliases", label_key: "settings.plan_feat_aliases_unlimited" },
    { kind: "domains", label_key: "settings.plan_feat_domains_unlimited" },
    { kind: "extra", label_key: "settings.plan_feat_priority_support" },
  ],
};

const LIMIT_HIGHLIGHT_KIND: Partial<Record<UpgradeLimitKey, HighlightKind>> = {
  max_email_aliases: "aliases",
  max_custom_domains: "domains",
};

function order_highlights(
  highlights: PlanHighlight[],
  lead: HighlightKind | null,
): PlanHighlight[] {
  if (!lead) return highlights;

  return [
    ...highlights.filter((entry) => entry.kind === lead),
    ...highlights.filter((entry) => entry.kind !== lead),
  ];
}

const GRID_COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1 sm:max-w-sm sm:mx-auto",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

function upgrade_tiers(plan_code: string | null): PlanTier[] {
  const index = PLAN_TIERS.findIndex((tier) => tier.id === plan_code);

  if (index === -1 && plan_code && plan_code !== "free") return [];

  return PLAN_TIERS.slice(index + 1);
}

function checkout_interval_for(term_id: string): string {
  if (term_id === "monthly") return "month";
  if (term_id === "biennial") return "biennial";

  return "year";
}

function term_id_for_interval(interval: UpgradeInterval | null): string {
  if (interval === "month") return "monthly";
  if (interval === "biennial") return "biennial";

  return "yearly";
}

function is_desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function UpgradeModal() {
  const { t } = use_i18n();
  const location = useLocation();
  const state = use_upgrade_state();
  const { is_authenticated } = use_auth();
  const is_blocked = is_on_auth_route(location.pathname) || !is_authenticated;
  const {
    limits,
    is_loading: is_loading_limits,
    load_failed: limits_load_failed,
    refresh,
  } = use_plan_limits();
  const [currency, set_currency] = useState("usd");
  const [audience, set_audience] = useState<PlanAudience>("individual");
  const [interval, set_interval] = useState<"month" | "year">("year");
  const [term_id, set_term_id] = useState("yearly");
  const [crypto_tier, set_crypto_tier] = useState<PlanTier | null>(null);
  const [crypto_term_months, set_crypto_term_months] = useState(12);
  const [pending_tier, set_pending_tier] = useState<PlanTier | null>(null);
  const [compare_open, set_compare_open] = useState(false);
  const [is_starting, set_is_starting] = useState(false);
  const pending_desktop_checkout_ref = useRef(false);
  const seeded_open_seq_ref = useRef(0);

  use_currency_rates();

  useEffect(() => {
    set_currency(detect_currency_from_locale());
  }, []);

  useEffect(() => {
    function handle_plan_limit(e: Event) {
      const detail =
        (
          e as CustomEvent<{
            resource?: string | null;
            message?: string | null;
          }>
        ).detail || {};

      show_plan_limit_upgrade({
        resource: detail.resource ?? null,
        message: detail.message ?? null,
      });
    }

    function handle_storage_full(e: Event) {
      const detail =
        (e as CustomEvent<{ message?: string | null }>).detail || {};

      show_storage_full_upgrade({ message: detail.message ?? null });
    }

    window.addEventListener("aster:plan-limit-hit", handle_plan_limit);
    window.addEventListener("aster:storage-full", handle_storage_full);

    return () => {
      window.removeEventListener("aster:plan-limit-hit", handle_plan_limit);
      window.removeEventListener("aster:storage-full", handle_storage_full);
    };
  }, []);

  useEffect(() => {
    if (is_blocked && state.is_open) {
      close_upgrade_modal();
    }
  }, [is_blocked, state.is_open]);

  useEffect(() => {
    const handle_focus = () => {
      if (!pending_desktop_checkout_ref.current) return;
      pending_desktop_checkout_ref.current = false;
      set_is_starting(false);
      request_cache.invalidate("/payments/v1");
      refresh(true);
    };

    window.addEventListener("focus", handle_focus);

    return () => window.removeEventListener("focus", handle_focus);
  }, [refresh]);

  const is_storage = state.reason === "storage_full";
  const is_resume = state.reason === "checkout_cancelled";
  const is_offer = state.reason === "offer";
  const is_manual = state.reason === "manual";

  const limit_info = useMemo(() => {
    if (!limits || state.limit_key === "generic") return null;

    return limits.limits[state.limit_key] ?? null;
  }, [limits, state.limit_key]);

  const plan_name = limits?.plan_name ?? null;
  const plan_code = limits?.plan_code ?? null;

  const individual_tiers = useMemo(() => upgrade_tiers(plan_code), [plan_code]);

  const family_tiers = useMemo<PlanTier[]>(
    () =>
      FAMILY_PLAN_TIERS.map((entry) => ({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        monthly_cents: entry.monthly_cents,
        yearly_cents: entry.yearly_cents,
        biennial_cents: entry.biennial_cents,
        savings_cents: Math.max(
          0,
          entry.monthly_cents * 12 - entry.yearly_cents,
        ),
        biennial_savings_cents: Math.max(
          0,
          entry.monthly_cents * 24 - entry.biennial_cents,
        ),
        is_recommended: entry.is_recommended,
      })),
    [],
  );

  const tiers = audience === "family" ? family_tiers : individual_tiers;

  const yearly_save_percent = useMemo(() => {
    const best = tiers.reduce((acc, entry) => {
      const full = entry.monthly_cents * 12;

      if (full <= 0) return acc;

      return Math.max(acc, ((full - entry.yearly_cents) / full) * 100);
    }, 0);

    return Math.round(best);
  }, [tiers]);

  const required_tier = useMemo(
    () => (is_storage ? null : min_plan_for_feature(state.feature_key)),
    [is_storage, state.feature_key],
  );

  const default_tier = useMemo(() => {
    if (tiers.length === 0) return null;

    const preselected = state.preselect_plan_code
      ? tiers.find((tier) => tier.id === state.preselect_plan_code)
      : null;
    const required = required_tier
      ? tiers.find((tier) => tier.id === required_tier.id)
      : null;

    return (
      preselected ??
      required ??
      tiers.find((tier) => tier.is_recommended) ??
      tiers[0]
    );
  }, [tiers, required_tier, state.preselect_plan_code]);

  const resume_target = useMemo(() => {
    if (state.reason !== "checkout_cancelled") return null;
    if (!state.preselect_plan_code) return null;

    const individual = individual_tiers.find(
      (tier) => tier.id === state.preselect_plan_code,
    );

    if (individual) {
      return { tier: individual, audience: "individual" as PlanAudience };
    }

    const family = family_tiers.find(
      (tier) => tier.id === state.preselect_plan_code,
    );

    if (family) return { tier: family, audience: "family" as PlanAudience };

    return null;
  }, [state.reason, state.preselect_plan_code, individual_tiers, family_tiers]);

  useEffect(() => {
    if (!state.is_open || is_blocked) return;

    refresh(true);

    if (seeded_open_seq_ref.current === state.open_seq) return;
    seeded_open_seq_ref.current = state.open_seq;

    set_is_starting(false);
    set_compare_open(false);
    set_crypto_tier(null);

    if (resume_target) {
      set_audience(resume_target.audience);
      set_term_id(term_id_for_interval(state.preselect_interval));
      set_pending_tier(resume_target.tier);

      return;
    }

    set_pending_tier(null);
  }, [
    state.is_open,
    state.open_seq,
    state.preselect_interval,
    resume_target,
    is_blocked,
    refresh,
  ]);

  const handle_currency_change = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;

    set_currency(next);
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    } catch {
      return;
    }
  };

  useEffect(() => {
    if (state.is_open && state.preselect_interval) {
      set_interval(state.preselect_interval === "month" ? "month" : "year");
    }
  }, [state.is_open, state.preselect_interval]);

  const lead_kind: HighlightKind | null = is_storage
    ? "storage"
    : (LIMIT_HIGHLIGHT_KIND[state.limit_key] ?? null);

  const tier_features = (tier: PlanTier) => {
    const family_features =
      tier.id === "duo"
        ? FAMILY_PLAN_DUO_FEATURES
        : tier.id === "family"
          ? FAMILY_PLAN_FAMILY_FEATURES
          : null;

    if (family_features) {
      return family_features.map((entry) => ({
        label: t(entry.label_key as never),
        on: entry.on,
      }));
    }

    return order_highlights(PLAN_HIGHLIGHTS[tier.id] ?? [], lead_kind).map(
      (highlight) => {
        const info_key =
          highlight.info_key ?? HIGHLIGHT_INFO_KEY[highlight.kind];

        return {
          label: t(highlight.label_key as never),
          on: true,
          info: info_key ? t(info_key as never) : undefined,
        };
      },
    );
  };

  const resource_label = state.limit_key
    ? t(LIMIT_LABEL_KEY[state.limit_key] as never) || state.resource_label
    : state.resource_label;

  const title = is_storage
    ? t("settings.storage_locked_title")
    : is_resume
      ? t("settings.upgrade_resume_title")
      : is_offer
        ? t("settings.offer_upgrade_title")
        : is_manual
          ? t("settings.win_back_offer_action")
          : t("settings.upgrade_modal_title");

  const description = is_storage
    ? t("settings.storage_locked_description")
    : is_resume
      ? t("settings.upgrade_resume_description")
      : is_offer
        ? t("settings.offer_upgrade_description")
        : is_manual
          ? t("settings.upgrade_for_more")
          : state.server_message && state.server_message.trim().length > 0
            ? state.server_message
            : limit_info && resource_label
              ? t("settings.upgrade_modal_description_specific", {
                  resource: String(resource_label).toLowerCase(),
                  plan: plan_name ?? "",
                })
              : t("settings.upgrade_modal_description_generic");

  const monthly_equivalent = (tier: PlanTier) =>
    interval === "year"
      ? Math.round(tier.yearly_cents / 12)
      : tier.monthly_cents;

  const price_label = (tier: PlanTier) =>
    format_price(convert_cents(monthly_equivalent(tier), currency), currency);

  const start_plan_change = async (tier: PlanTier, billing: string) => {
    set_is_starting(true);

    try {
      const result = await change_plan(tier.id, billing);

      if (!result.ok) {
        show_toast(
          checkout_error_text(t, result.server_code),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
        set_is_starting(false);

        return;
      }

      if (result.requires_checkout) {
        if (is_desktop()) {
          pending_desktop_checkout_ref.current = true;
          set_is_starting(false);
        }

        return;
      }

      request_cache.invalidate("/payments/v1");
      await refresh(true);
      show_toast(t("settings.payment_success"), "success");
      close_upgrade_modal();
      set_is_starting(false);
    } catch {
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_is_starting(false);
    }
  };

  const handle_select_tier = (tier: PlanTier) => {
    if (is_starting) return;

    if (!limits) {
      show_toast(t("common.something_went_wrong_try_again"), "error");
      void refresh();

      return;
    }

    set_term_id(interval === "month" ? "monthly" : "yearly");
    set_pending_tier(tier);
  };

  const handle_choose_crypto = (selected_term_id?: string) => {
    if (is_starting || !pending_tier) return;

    const tier = pending_tier;
    const chosen = selected_term_id ?? term_id;

    set_crypto_term_months(
      chosen === "monthly" ? 1 : chosen === "biennial" ? 24 : 12,
    );
    set_pending_tier(null);
    set_crypto_tier(tier);
  };

  const handle_choose_card = async (selected_term_id?: string) => {
    if (is_starting || !pending_tier) return;

    const billing = checkout_interval_for(selected_term_id ?? term_id);

    if (!!plan_code && plan_code !== "free") {
      void start_plan_change(pending_tier, billing);

      return;
    }

    set_is_starting(true);

    try {
      const result = await start_hosted_checkout(
        pending_tier.id,
        billing,
        currency,
      );

      if (!result.ok) {
        show_toast(
          checkout_error_text(t, result.server_code),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
      } else if (is_desktop()) {
        pending_desktop_checkout_ref.current = true;
      }

      set_is_starting(false);
    } catch {
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_is_starting(false);
    }
  };

  useEffect(() => {
    const guard_active = (state.is_open && !is_blocked) || !!pending_tier;

    if (!guard_active) return;

    const handle_before_unload = (event: BeforeUnloadEvent) => {
      if (is_payment_navigation()) return;

      event.preventDefault();
      event.returnValue = t("settings.checkout_leave_warning");
    };

    window.addEventListener("beforeunload", handle_before_unload);

    return () => {
      window.removeEventListener("beforeunload", handle_before_unload);
    };
  }, [state.is_open, is_blocked, pending_tier, t]);

  const handle_compare_plans = () => {
    set_compare_open(true);
  };

  const handle_buy_storage = () => {
    close_upgrade_modal();
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("navigate-settings", {
          detail: { section: "billing", anchor: "additional_storage_section" },
        }),
      );
    });
  };

  const limits_failed = !limits && limits_load_failed && !is_loading_limits;
  const is_first_load = !limits && !limits_failed;

  const storage = limits?.storage ?? null;
  const storage_percentage = storage
    ? Math.min(100, storage.percentage_used)
    : 0;

  return (
    <>
      <Modal
        close_on_escape={false}
        close_on_overlay={false}
        is_open={state.is_open && !is_blocked && !pending_tier && !crypto_tier}
        on_close={close_upgrade_modal}
        size="2xl"
      >
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>{description}</ModalDescription>
        </ModalHeader>

        <ModalBody className="space-y-4">
          {state.limit_key === "max_external_accounts" ? (
            <div className="rounded-2xl border border-edge-secondary bg-surf-tertiary px-3.5 py-2.5">
              <p className="text-[13px] text-txt-secondary">
                {t("settings.upgrade_external_accounts_note")}
              </p>
            </div>
          ) : null}

          {state.limit_key === "max_linked_accounts" ? (
            <div className="rounded-2xl border border-edge-secondary bg-surf-tertiary px-3.5 py-2.5">
              <p className="text-[13px] text-txt-secondary">
                {t("settings.upgrade_linked_accounts_note")}
              </p>
              <a
                className="mt-1 inline-block text-[13px] font-medium underline"
                href="https://astermail.org/multiple-accounts"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-color)" }}
                target="_blank"
              >
                {t("settings.upgrade_linked_accounts_link")}
              </a>
            </div>
          ) : null}

          {required_tier ? (
            <div
              className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--accent-color) 10%, transparent)",
              }}
            >
              <LockClosedIcon
                className="h-4 w-4 flex-shrink-0"
                style={{ color: "var(--accent-color)" }}
              />
              <p className="text-[13px] font-medium text-txt-primary">
                {t("settings.available_on_plan", {
                  plan: required_tier.name,
                })}
              </p>
            </div>
          ) : null}

          {is_storage && storage ? (
            <div className="p-3 rounded-lg bg-surf-tertiary border border-edge-secondary">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-txt-primary">
                  {t("settings.usage_storage")}
                </span>
                <span
                  className="text-xs font-medium"
                  style={{
                    color: storage.is_locked
                      ? "var(--destructive)"
                      : "var(--text-secondary)",
                  }}
                >
                  {format_bytes(storage.used_bytes)} /{" "}
                  {format_bytes(storage.limit_bytes)}
                </span>
              </div>
              <Progress
                className={`h-1.5 ${storage.is_locked ? "[&>div]:bg-red-500" : storage.is_warning ? "[&>div]:bg-amber-500" : ""}`}
                value={storage_percentage}
              />
              {storage.days_until_permanent_bounce !== null &&
                storage.is_locked && (
                  <p
                    className="mt-3 text-xs"
                    style={{ color: "var(--destructive)" }}
                  >
                    {t("settings.storage_locked_bounce_warning", {
                      days: storage.days_until_permanent_bounce,
                    })}
                  </p>
                )}
            </div>
          ) : null}

          {!is_storage && limit_info ? (
            <div className="p-3 rounded-lg bg-surf-tertiary border border-edge-secondary">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-txt-primary">
                  {resource_label}
                </span>
                <span
                  className="text-xs font-medium tabular-nums"
                  style={{
                    color: limit_info.is_at_limit
                      ? "var(--destructive)"
                      : "var(--text-secondary)",
                  }}
                >
                  {t("settings.usage_of", {
                    current: limit_info.current,
                    limit:
                      limit_info.limit === -1
                        ? t("settings.usage_unlimited")
                        : String(limit_info.limit),
                  })}
                </span>
              </div>
              <Progress
                className={`h-1.5 ${limit_info.is_at_limit ? "[&>div]:bg-red-500" : ""}`}
                value={
                  limit_info.limit > 0
                    ? Math.min(
                        100,
                        (limit_info.current / limit_info.limit) * 100,
                      )
                    : 100
                }
              />
            </div>
          ) : null}

          {limits_failed ? (
            <LoadFailedNotice on_retry={() => void refresh(true)} />
          ) : null}

          {is_first_load ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="sm" />
            </div>
          ) : null}

          {!is_first_load && !limits_failed && tiers.length > 0 && (
            <>
              <div className="flex flex-col items-center gap-3 pt-1">
                <Tabs
                  on_change={set_audience}
                  options={[
                    {
                      id: "individual",
                      label: t("settings.plan_type_individual"),
                    },
                    { id: "family", label: t("settings.plan_type_family") },
                  ]}
                  value={audience}
                />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Segmented
                    on_change={(value) => set_interval(value)}
                    options={[
                      { id: "month", label: t("settings.billing_monthly") },
                      {
                        id: "year",
                        label: t("settings.billing_yearly"),
                        badge:
                          yearly_save_percent > 0
                            ? t("settings.save_percent", {
                                percent: yearly_save_percent,
                              })
                            : undefined,
                      },
                    ]}
                    value={interval}
                  />
                  <select
                    aria-label={t("settings.select_currency")}
                    className="cursor-pointer rounded-full border border-edge-secondary bg-transparent px-3 py-1.5 text-xs text-txt-secondary outline-none transition-colors hover:text-txt-primary focus:border-blue-500"
                    value={currency}
                    onChange={handle_currency_change}
                  >
                    {SUPPORTED_CURRENCIES.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                className={`grid gap-4 pt-3 ${GRID_COLUMNS[tiers.length] ?? "sm:grid-cols-3"}`}
              >
                {tiers.map((tier) => {
                  const is_required = required_tier?.id === tier.id;

                  return (
                    <PlanCard
                      key={tier.id}
                      compact
                      anchor_label={
                        interval === "year"
                          ? format_price(
                              convert_cents(tier.monthly_cents, currency),
                              currency,
                            )
                          : null
                      }
                      badge={
                        is_required
                          ? t("common.unlock")
                          : tier.is_recommended
                            ? t("settings.plan_recommended")
                            : null
                      }
                      billed_note={
                        interval === "year"
                          ? t("settings.billed_annually")
                          : null
                      }
                      cta_disabled={is_starting}
                      cta_label={t("settings.get_plan", { name: tier.name })}
                      description={null}
                      featured={
                        is_required ||
                        (!required_tier && default_tier?.id === tier.id)
                      }
                      features={tier_features(tier)}
                      is_current={false}
                      name={tier.name}
                      on_cta={() => handle_select_tier(tier)}
                      period_label={t("settings.per_month_short")}
                      price_label={price_label(tier)}
                      save_label={null}
                    />
                  );
                })}
              </div>

              {currency !== "usd" && (
                <p className="pt-3 text-xs text-txt-muted text-center">
                  {t("settings.prices_converted_note")}
                </p>
              )}
            </>
          )}

          {!is_first_load && !limits_failed && tiers.length === 0 && (
            <ul className="space-y-2.5 text-[13px] text-txt-secondary">
              {[
                t("settings.upgrade_perk_storage"),
                t("settings.upgrade_perk_aliases"),
                t("settings.upgrade_perk_domains"),
                t("settings.upgrade_perk_features"),
              ].map((perk) => (
                <li key={perk} className="flex items-start gap-2.5">
                  <CheckCircleIcon
                    className="mt-0.5 h-[18px] w-[18px] flex-shrink-0"
                    style={{ color: "var(--accent-blue)" }}
                  />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col items-center gap-1.5 pt-1">
            <div className="flex items-center justify-center gap-1.5 text-[13px] text-txt-secondary">
              <ShieldCheckIcon
                className="w-4 h-4 flex-shrink-0"
                style={{ color: "var(--accent-blue)" }}
              />
              <span>{t("settings.cancel_anytime")}</span>
            </div>
            <p className="text-xs text-txt-muted text-center">
              {t("auth.no_ads_no_tracking")}
            </p>
          </div>
        </ModalBody>

        <ModalFooter className="gap-3">
          {is_storage ? (
            <Button
              className="flex-1"
              disabled={is_starting}
              variant="outline"
              onClick={handle_buy_storage}
            >
              {t("settings.upgrade_buy_storage")}
            </Button>
          ) : (
            <Button
              className="flex-1"
              disabled={is_starting}
              variant="outline"
              onClick={handle_compare_plans}
            >
              {t("auth.plan_view_full_features")}
            </Button>
          )}
          <Button
            className="text-txt-muted"
            disabled={is_starting}
            size="sm"
            variant="ghost"
            onClick={close_upgrade_modal}
          >
            {t("common.not_now")}
          </Button>
          {is_starting && (
            <span className="flex items-center px-2">
              <Spinner size="xs" />
            </span>
          )}
        </ModalFooter>
      </Modal>

      {pending_tier && (
        <PlanPaymentMethodModal
          busy={is_starting}
          comparison_plan_code={pending_tier.id}
          features={tier_features(pending_tier)
            .filter((feature) => feature.on)
            .map((feature) => ({ label: feature.label }))}
          on_choose_card={(id) => void handle_choose_card(id)}
          on_choose_crypto={handle_choose_crypto}
          on_close={() => {
            if (is_starting) return;
            set_pending_tier(null);
          }}
          on_select_plan={(id) => {
            const next = tiers.find((tier) => tier.id === id);

            if (next) set_pending_tier(next);
          }}
          on_select_term={set_term_id}
          open={!!pending_tier}
          plan_choices={tiers.map((tier) => ({
            id: tier.id,
            name: tier.name,
            is_recommended: tier.id === default_tier?.id,
            price_label: `${price_label(tier)}${t("settings.per_month_short")}`,
          }))}
          plan_name={pending_tier.name}
          selected_plan_id={pending_tier.id}
          selected_term={term_id}
          term_options={[
            {
              id: "monthly",
              label: t("settings.billing_monthly"),
              per_month_cents: pending_tier.monthly_cents,
              total_cents: pending_tier.monthly_cents,
              save_cents: 0,
            },
            {
              id: "yearly",
              label: t("settings.billing_yearly"),
              per_month_cents: Math.round(pending_tier.yearly_cents / 12),
              total_cents: pending_tier.yearly_cents,
              save_cents:
                pending_tier.monthly_cents * 12 - pending_tier.yearly_cents,
            },
            {
              id: "biennial",
              label: t("settings.biennial"),
              crypto_only: true,
              per_month_cents: Math.round(pending_tier.biennial_cents / 24),
              total_cents: pending_tier.biennial_cents,
              save_cents:
                pending_tier.monthly_cents * 24 - pending_tier.biennial_cents,
            },
          ]}
        />
      )}

      <PlanFeaturesModal
        highlight_plan_code={pending_tier?.id ?? default_tier?.id ?? null}
        is_open={compare_open}
        on_close={() => set_compare_open(false)}
        z_index={80}
      />

      {crypto_tier && (
        <CryptoTermModal
          initial_term_months={crypto_term_months}
          is_open={!!crypto_tier}
          monthly_price_cents={crypto_tier.monthly_cents}
          on_checkout_opened={() => {
            if (is_desktop()) pending_desktop_checkout_ref.current = true;
          }}
          on_close={() => {
            const tier = crypto_tier;

            set_crypto_tier(null);
            set_pending_tier(tier);
          }}
          plan_code={crypto_tier.id}
          plan_name={crypto_tier.name}
          preferred_currency={currency}
          yearly_price_cents={crypto_tier.yearly_cents}
        />
      )}
    </>
  );
}
