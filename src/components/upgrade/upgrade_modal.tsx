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
import { useEffect, useMemo, useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { show_toast } from "@/components/toast/simple_toast";
import { request_cache } from "@/services/api/request_cache";
import {
  change_plan,
  format_price,
  start_hosted_checkout,
} from "@/services/api/billing";
import {
  PLAN_TIERS,
  convert_cents,
  detect_currency_from_locale,
  min_plan_for_feature,
  type PlanTier,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { PlanCard, Segmented } from "@/components/settings/billing/plan_card";
import {
  close_upgrade_modal,
  show_plan_limit_upgrade,
  show_storage_full_upgrade,
  use_upgrade_state,
  type UpgradeLimitKey,
} from "@/stores/upgrade_store";

const LIMIT_LABEL_KEY: Record<UpgradeLimitKey, string> = {
  max_email_aliases: "settings.usage_aliases",
  max_custom_domains: "settings.usage_domains",
  max_contacts: "settings.usage_contacts",
  max_email_templates: "settings.usage_templates",
  max_html_signatures: "settings.usage_signatures",
  max_custom_filters: "settings.usage_filters",
  max_custom_categories: "settings.usage_custom_categories",
  generic: "settings.upgrade_generic_resource",
};

type HighlightKind = "storage" | "aliases" | "domains" | "extra";

interface PlanHighlight {
  kind: HighlightKind;
  label_key: string;
}

const PLAN_HIGHLIGHTS: Record<string, PlanHighlight[]> = {
  star: [
    { kind: "storage", label_key: "settings.plan_feat_storage_50" },
    { kind: "aliases", label_key: "settings.plan_feat_aliases_15" },
    { kind: "domains", label_key: "settings.plan_feat_domains_5" },
    { kind: "extra", label_key: "settings.plan_feat_advanced_aliases" },
  ],
  nova: [
    { kind: "storage", label_key: "settings.plan_feat_storage_500" },
    { kind: "aliases", label_key: "settings.plan_feat_aliases_unlimited" },
    { kind: "domains", label_key: "settings.plan_feat_domains_30" },
    { kind: "extra", label_key: "settings.plan_feat_smart_folders" },
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

  return PLAN_TIERS.slice(index + 1);
}

function yearly_savings_percent(tier: PlanTier): number {
  const full = tier.monthly_cents * 12;

  if (full <= 0) return 0;

  return Math.round(((full - tier.yearly_cents) / full) * 100);
}

function format_bytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit_index = 0;

  while (value >= 1024 && unit_index < units.length - 1) {
    value /= 1024;
    unit_index++;
  }

  return `${value.toFixed(value >= 10 || unit_index === 0 ? 0 : 1)} ${units[unit_index]}`;
}

export function UpgradeModal() {
  const { t } = use_i18n();
  const state = use_upgrade_state();
  const { limits, refresh } = use_plan_limits();
  const [currency, set_currency] = useState("usd");
  const [interval, set_interval] = useState<"month" | "year">("year");
  const [selected_id, set_selected_id] = useState<string | null>(null);
  const [is_starting, set_is_starting] = useState(false);

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
    if (state.is_open) {
      refresh(true);
      set_is_starting(false);
    }
  }, [state.is_open, refresh]);

  const is_storage = state.reason === "storage_full";

  const limit_info = useMemo(() => {
    if (!limits || state.limit_key === "generic") return null;

    return limits.limits[state.limit_key] ?? null;
  }, [limits, state.limit_key]);

  const plan_name = limits?.plan_name ?? null;
  const plan_code = limits?.plan_code ?? null;

  const tiers = useMemo(() => upgrade_tiers(plan_code), [plan_code]);

  const required_tier = useMemo(
    () => (is_storage ? null : min_plan_for_feature(state.feature_key)),
    [is_storage, state.feature_key],
  );

  const default_tier = useMemo(() => {
    if (tiers.length === 0) return null;

    const required = required_tier
      ? tiers.find((tier) => tier.id === required_tier.id)
      : null;

    return required ?? tiers.find((tier) => tier.is_recommended) ?? tiers[0];
  }, [tiers, required_tier]);

  useEffect(() => {
    set_selected_id(default_tier?.id ?? null);
  }, [default_tier, state.is_open]);

  const selected_tier = useMemo(
    () => tiers.find((tier) => tier.id === selected_id) ?? default_tier,
    [tiers, selected_id, default_tier],
  );

  const lead_kind: HighlightKind | null = is_storage
    ? "storage"
    : (LIMIT_HIGHLIGHT_KIND[state.limit_key] ?? null);

  const tier_features = (tier: PlanTier) =>
    order_highlights(PLAN_HIGHLIGHTS[tier.id] ?? [], lead_kind).map(
      (highlight) => ({
        label: t(highlight.label_key as never),
        on: true,
      }),
    );

  const resource_label = state.limit_key
    ? t(LIMIT_LABEL_KEY[state.limit_key] as never) || state.resource_label
    : state.resource_label;

  const title = is_storage
    ? t("settings.storage_locked_title")
    : t("settings.upgrade_modal_title");

  const description = is_storage
    ? t("settings.storage_locked_description")
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

  const handle_upgrade = async (tier: PlanTier) => {
    if (is_starting) return;

    set_selected_id(tier.id);

    set_is_starting(true);

    try {
      const has_paid_plan = !!plan_code && plan_code !== "free";

      if (has_paid_plan) {
        const result = await change_plan(tier.id, interval);

        if (!result.ok) {
          show_toast(t("settings.payment_failed"), "error");
          set_is_starting(false);

          return;
        }

        if (result.requires_checkout) return;

        request_cache.invalidate("/payments/v1");
        await refresh();
        show_toast(t("settings.payment_success"), "success");
        close_upgrade_modal();
        set_is_starting(false);

        return;
      }

      const result = await start_hosted_checkout(
        tier.id,
        interval,
        currency,
      );

      if (!result.ok) {
        show_toast(t("settings.failed_checkout"), "error");
        set_is_starting(false);
      } else if (
        typeof window !== "undefined" &&
        "__TAURI_INTERNALS__" in window
      ) {
        set_is_starting(false);
      }
    } catch {
      show_toast(t("settings.failed_checkout"), "error");
      set_is_starting(false);
    }
  };

  const handle_compare_plans = () => {
    close_upgrade_modal();
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("navigate-settings", {
          detail: { section: "billing", anchor: "available-plans" },
        }),
      );
    });
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

  const storage = limits?.storage ?? null;
  const storage_percentage = storage
    ? Math.min(100, storage.percentage_used)
    : 0;

  const savings_percent = selected_tier
    ? yearly_savings_percent(selected_tier)
    : 0;

  return (
    <Modal is_open={state.is_open} on_close={close_upgrade_modal} size="2xl">
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-4">
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
              {t("settings.available_on_plan", { plan: required_tier.name })}
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
                    days: String(storage.days_until_permanent_bounce),
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
                  current: String(limit_info.current),
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
                  ? Math.min(100, (limit_info.current / limit_info.limit) * 100)
                  : 100
              }
            />
          </div>
        ) : null}

        {tiers.length > 0 && (
          <>
            <div className="flex items-center justify-center">
              <Segmented
                on_change={(v) => set_interval(v === "yearly" ? "year" : "month")}
                options={[
                  { id: "monthly", label: t("settings.billing_monthly") },
                  {
                    id: "yearly",
                    label: t("settings.billing_yearly"),
                    badge:
                      savings_percent > 0
                        ? t("settings.save_percent", {
                            percent: String(savings_percent),
                          })
                        : undefined,
                  },
                ]}
                value={interval === "year" ? "yearly" : "monthly"}
              />
            </div>

            <div className={`grid gap-4 pt-3 ${GRID_COLUMNS[tiers.length] ?? "sm:grid-cols-3"}`}>
              {tiers.map((tier) => {
                const is_required = required_tier?.id === tier.id;

                return (
                  <PlanCard
                    compact
                    key={tier.id}
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
                      interval === "year" ? t("settings.billed_annually") : null
                    }
                    cta_disabled={is_starting}
                    cta_label={t("settings.get_plan", { name: tier.name })}
                    description={null}
                    featured={is_required || (!required_tier && !!tier.is_recommended)}
                    features={tier_features(tier)}
                    is_current={false}
                    name={tier.name}
                    period_label={t("settings.per_month_short")}
                    price_label={price_label(tier)}
                    save_label={null}
                    on_cta={() => handle_upgrade(tier)}
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

        {tiers.length === 0 && (
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

        <div className="flex items-center justify-center gap-1.5 text-xs text-txt-muted">
          <ShieldCheckIcon className="w-3.5 h-3.5 text-txt-muted" />
          <span>
            {t("settings.money_back_guarantee")} &middot;{" "}
            {t("settings.cancel_anytime")}
          </span>
        </div>
      </ModalBody>

      <ModalFooter className="gap-2">
        <Button
          className="flex-1"
          disabled={is_starting}
          variant="ghost"
          onClick={close_upgrade_modal}
        >
          {t("common.not_now")}
        </Button>
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
            {t("settings.upgrade_view_plans")}
          </Button>
        )}
        {is_starting && (
          <span className="flex items-center px-2">
            <Spinner size="xs" />
          </span>
        )}
      </ModalFooter>
    </Modal>
  );
}
