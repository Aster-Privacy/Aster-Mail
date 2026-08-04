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
import { CheckIcon, LockClosedIcon } from "@heroicons/react/24/solid";
import { UpgradeBtn } from "@aster/ui";

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
      refresh();
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

  const highlights = useMemo(() => {
    if (!selected_tier) return [];

    const lead: HighlightKind | null = is_storage
      ? "storage"
      : (LIMIT_HIGHLIGHT_KIND[state.limit_key] ?? null);

    return order_highlights(PLAN_HIGHLIGHTS[selected_tier.id] ?? [], lead);
  }, [selected_tier, is_storage, state.limit_key]);

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

  const total_label = (tier: PlanTier) =>
    format_price(convert_cents(tier.yearly_cents, currency), currency);

  const handle_upgrade = async () => {
    if (!selected_tier || is_starting) return;

    set_is_starting(true);

    try {
      const has_paid_plan = !!plan_code && plan_code !== "free";

      if (has_paid_plan) {
        const result = await change_plan(selected_tier.id, interval);

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
        selected_tier.id,
        interval,
        currency,
      );

      if (!result.ok) {
        show_toast(t("settings.failed_checkout"), "error");
        set_is_starting(false);
      }
    } catch {
      show_toast(t("settings.failed_checkout"), "error");
      set_is_starting(false);
    }
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
    <Modal is_open={state.is_open} on_close={close_upgrade_modal} size="lg">
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {required_tier ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-edge-secondary bg-surf-tertiary px-3.5 py-2.5">
            <LockClosedIcon className="h-4 w-4 flex-shrink-0 text-txt-muted" />
            <p className="text-[13px] font-medium text-txt-primary">
              {t("settings.available_on_plan", { plan: required_tier.name })}
            </p>
          </div>
        ) : null}

        {is_storage && storage ? (
          <div className="rounded-xl border border-edge-secondary bg-surf-tertiary p-4">
            <div className="mb-2 flex items-center justify-between">
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
          <div className="rounded-xl border border-edge-secondary bg-surf-tertiary p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-txt-primary">
                {resource_label}
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--destructive)" }}
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
              className="h-1.5 [&>div]:bg-red-500"
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
              <div className="inline-flex items-center gap-1 rounded-full bg-surf-tertiary p-1">
                {(["month", "year"] as const).map((option) => (
                  <button
                    key={option}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                      interval === option
                        ? "bg-surf-primary text-txt-primary"
                        : "text-txt-muted hover:text-txt-secondary"
                    }`}
                    type="button"
                    onClick={() => set_interval(option)}
                  >
                    {option === "month"
                      ? t("settings.billing_monthly")
                      : t("settings.billing_yearly")}
                    {option === "year" && savings_percent > 0 && (
                      <span className="ml-1.5 text-[11px] font-semibold text-blue-500">
                        {t("settings.save_percent", {
                          percent: String(savings_percent),
                        })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {tiers.map((tier) => {
                const is_selected = selected_tier?.id === tier.id;
                const is_required = required_tier?.id === tier.id;

                return (
                  <button
                    key={tier.id}
                    aria-pressed={is_selected}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                      is_selected
                        ? "border-blue-500 bg-blue-500/[0.07]"
                        : "border-edge-secondary hover:border-edge-primary"
                    }`}
                    type="button"
                    onClick={() => set_selected_id(tier.id)}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-txt-primary">
                        {tier.name}
                      </span>
                      {(is_required || tier.is_recommended) && (
                        <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-500">
                          {is_required
                            ? t("common.unlock")
                            : t("settings.plan_recommended")}
                        </span>
                      )}
                    </span>
                    <span className="text-[19px] font-semibold leading-tight text-txt-primary">
                      {price_label(tier)}
                      <span className="text-[12px] font-normal text-txt-muted">
                        {t("settings.per_month_short")}
                      </span>
                    </span>
                    <span className="text-[11px] text-txt-muted">
                      {interval === "year"
                        ? `${total_label(tier)} ${t("settings.billed_annually")}`
                        : t("settings.cancel_anytime")}
                    </span>
                    <span
                      className={`mt-2 flex w-full items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        is_selected
                          ? "bg-blue-500 text-white"
                          : "border border-edge-secondary text-txt-secondary"
                      }`}
                    >
                      {is_selected
                        ? t("auth.plan_selected")
                        : t("auth.plan_select")}
                    </span>
                  </button>
                );
              })}
            </div>

            {selected_tier && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {highlights.map((highlight) => (
                  <li
                    key={highlight.label_key}
                    className="flex items-start gap-2 text-[13px] text-txt-secondary"
                  >
                    <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                    <span>{t(highlight.label_key as never)}</span>
                  </li>
                ))}
              </ul>
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
              <li key={perk} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[12px] text-txt-muted">
          {t("settings.money_back_guarantee")} &middot;{" "}
          {t("settings.cancel_anytime")}
        </p>
      </ModalBody>

      <ModalFooter className="flex-col-reverse gap-2">
        <div className="flex w-full items-center gap-2">
          <button
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-txt-secondary transition-colors hover:bg-surf-secondary"
            disabled={is_starting}
            onClick={close_upgrade_modal}
          >
            {t("common.not_now")}
          </button>
          {is_storage && (
            <button
              className="flex-1 rounded-xl border border-edge-secondary bg-surf-secondary px-4 py-2.5 text-sm font-medium text-txt-primary transition-colors hover:bg-surf-tertiary"
              disabled={is_starting}
              onClick={handle_buy_storage}
            >
              {t("settings.upgrade_buy_storage")}
            </button>
          )}
        </div>
        <UpgradeBtn
          className="w-full"
          disabled={is_starting || !selected_tier}
          size="xl"
          onClick={handle_upgrade}
        >
          {is_starting ? (
            <Spinner size="xs" />
          ) : selected_tier ? (
            t("settings.upgrade_to", { name: selected_tier.name })
          ) : (
            t("settings.upgrade_view_plans")
          )}
        </UpgradeBtn>
      </ModalFooter>
    </Modal>
  );
}
