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
import type * as React from "react";
import type { TranslationKey } from "@/lib/i18n";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChartPieIcon,
  CircleStackIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  PencilSquareIcon,
  ShieldExclamationIcon,
  TagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { StorageAddonsSection } from "@/components/settings/billing/storage_addons_section";
import { StorageFormatPicker } from "@/components/settings/storage/storage_format_picker";
import { use_storage_format } from "@/components/settings/hooks/use_storage_format";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoAddonTermModal } from "@/components/settings/billing/crypto_addon_term_modal";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes, format_decimal, format_number } from "@/lib/utils";
import {
  addon_return_url,
  clear_addon_purchase_param,
} from "@/lib/addon_return_url";
import { is_onion_host } from "@/lib/onion_host";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { empty_spam, empty_trash } from "@/services/api/mail";
import {
  get_storage_overview,
  type StorageCategory,
  type StorageOverviewResponse,
} from "@/services/api/storage";
import {
  cancel_storage_addon,
  format_price,
  get_credits,
  get_storage_addons,
  purchase_storage_addon,
  type CreditBalanceResponse,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import {
  convert_cents,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import { use_sticky_value } from "@/hooks/use_sticky_value";
import { Spinner } from "@/components/ui/spinner";

export const STORAGE_PROMO_ENABLED = true;

interface CategoryStyle {
  color: string;
  icon: React.ElementType;
  label_key: TranslationKey;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  emails: {
    color: "var(--storage-emails)",
    icon: EnvelopeIcon,
    label_key: "mail.emails",
  },
  attachments: {
    color: "var(--storage-attachments)",
    icon: PaperClipIcon,
    label_key: "mail.attachments",
  },
  drafts: {
    color: "var(--storage-drafts)",
    icon: PencilSquareIcon,
    label_key: "mail.drafts",
  },
  spam: {
    color: "var(--storage-spam)",
    icon: ShieldExclamationIcon,
    label_key: "mail.spam",
  },
  trash: {
    color: "var(--storage-trash)",
    icon: TrashIcon,
    label_key: "mail.trash",
  },
};

const FALLBACK_STYLE: CategoryStyle = {
  color: "var(--storage-other)",
  icon: CircleStackIcon,
  label_key: "settings.storage",
};

function style_of(name: string): CategoryStyle {
  return CATEGORY_STYLES[name] ?? FALLBACK_STYLE;
}

const MIN_SEGMENT_SHARE = 1.2;

export function build_bar_segments(shares: number[]): number[] {
  const budget = Math.min(
    100,
    shares.reduce((total, share) => total + Math.max(0, share), 0),
  );

  if (budget <= 0) return shares.map(() => 0);

  const visible = shares.map((share) => Math.max(share, MIN_SEGMENT_SHARE));
  const visible_sum = visible.reduce((total, share) => total + share, 0);
  const scale = visible_sum > budget ? budget / visible_sum : 1;

  return visible.map((share) => share * scale);
}

function share_of(bytes: number, total: number): number {
  if (total <= 0 || bytes <= 0) return 0;

  return Math.min(100, (bytes / total) * 100);
}

export function StorageSection() {
  const { t } = use_i18n();
  const { storage_format, handle_storage_format_change } = use_storage_format();
  const on_onion = is_onion_host();

  const [overview, set_overview] = useState<StorageOverviewResponse | null>(
    null,
  );
  const [available_addons, set_available_addons] = useState<StorageAddonItem[]>(
    [],
  );
  const [active_addons, set_active_addons] = useState<UserActiveAddon[]>([]);
  const [promo, set_promo] = useState<{
    eligible: boolean;
    percent_off: number;
    duration_months: number;
  } | null>(null);
  const [credit_balance, set_credit_balance] =
    useState<CreditBalanceResponse | null>(null);
  const [selected_storage, set_selected_storage] = useState<string | null>(
    null,
  );
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [overview_load_failed, set_overview_load_failed] = useState(false);
  const [is_action_loading, set_is_action_loading] = useState(false);
  const [addon_to_cancel, set_addon_to_cancel] =
    useState<UserActiveAddon | null>(null);
  const [show_cancel_addon_dialog, set_show_cancel_addon_dialog] =
    useState(false);
  const [addon_method_target, set_addon_method_target] =
    useState<StorageAddonItem | null>(null);
  const [show_addon_method_modal, set_show_addon_method_modal] =
    useState(false);
  const [crypto_addon, set_crypto_addon] = useState<StorageAddonItem | null>(
    null,
  );
  const [show_crypto_addon_modal, set_show_crypto_addon_modal] =
    useState(false);
  const [cleanup_target, set_cleanup_target] = useState<
    "trash" | "spam" | null
  >(null);
  const [active_category, set_active_category] = useState<string | null>(null);

  const cleanup_view = use_sticky_value(cleanup_target);
  const capacity_sources = useMemo(() => {
    const all_sources: {
      key: string;
      bytes: number;
      label_key: TranslationKey;
      color: string;
    }[] = [
      {
        key: "plan",
        bytes: overview?.plan_limit_bytes ?? 0,
        label_key: "settings.storage_included_with_plan",
        color: "var(--capacity-plan)",
      },
      {
        key: "addons",
        bytes: overview?.addon_bytes ?? 0,
        label_key: "settings.storage_from_addons",
        color: "var(--capacity-addons)",
      },
      {
        key: "family",
        bytes: overview?.family_allocation_bytes ?? 0,
        label_key: "settings.storage_family_allocation",
        color: "var(--capacity-family)",
      },
    ];

    const entries = all_sources.filter((entry) => entry.bytes > 0);
    const sum = entries.reduce((total, entry) => total + entry.bytes, 0);
    const shares = entries.map((entry) =>
      sum > 0 ? (entry.bytes / sum) * 100 : 0,
    );
    const bar_shares = build_bar_segments(shares);

    return entries.map((entry, index) => ({
      ...entry,
      share: shares[index],
      bar_share: bar_shares[index],
    }));
  }, [overview]);

  const preferred_currency = useMemo(() => detect_currency_from_locale(), []);

  const load_data = useCallback(async () => {
    try {
      const [overview_response, addons_response, credits_response] =
        await Promise.all([
          get_storage_overview(),
          on_onion ? Promise.resolve(null) : get_storage_addons(),
          on_onion ? Promise.resolve(null) : get_credits(),
        ]);

      if (overview_response.data) {
        set_overview(overview_response.data);
        set_overview_load_failed(false);
      } else {
        set_overview_load_failed(true);
      }

      if (addons_response?.data) {
        set_available_addons(addons_response.data.available_addons);
        set_active_addons(addons_response.data.active_addons);
        const percent_off = addons_response.data.promo_percent_off ?? 0;
        const duration_months = addons_response.data.promo_duration_months ?? 0;

        set_promo({
          eligible:
            addons_response.data.promo_eligible === true &&
            percent_off > 0 &&
            duration_months > 0,
          percent_off,
          duration_months,
        });
      }

      if (credits_response?.data) set_credit_balance(credits_response.data);
    } catch {
      set_overview_load_failed(true);
    } finally {
      set_is_initial_load(false);
    }
  }, [on_onion]);

  useEffect(() => {
    load_data();
  }, [load_data]);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get(
      "addon_purchase",
    );

    if (!status) return;

    if (status === "success") {
      show_toast(t("settings.addon_purchased"), "success");
      request_cache.invalidate("/payments/v1");
      request_cache.invalidate("/sync/v1");
      invalidate_mail_stats();
      load_data();
    }

    clear_addon_purchase_param();
  }, [load_data, t]);

  const total_used = overview?.total_used_bytes ?? 0;
  const total_limit = overview?.total_limit_bytes ?? 0;
  const percentage =
    total_limit > 0
      ? (total_used / total_limit) * 100
      : (overview?.percentage_used ?? 0);
  const available_bytes = Math.max(0, total_limit - total_used);
  const categories = useMemo(
    () => (overview?.categories ?? []).filter((entry) => entry.bytes_used > 0),
    [overview],
  );

  const breakdown_rows = useMemo(() => {
    const by_name = new Map(
      (overview?.categories ?? []).map((entry) => [entry.name, entry]),
    );

    return Object.keys(CATEGORY_STYLES)
      .map(
        (name) =>
          by_name.get(name) ??
          ({
            name,
            bytes_used: 0,
            item_count: 0,
            percentage: 0,
          } as StorageCategory),
      )
      .sort((a, b) => b.bytes_used - a.bytes_used);
  }, [overview]);

  const trash_category = overview?.categories.find(
    (entry) => entry.name === "trash",
  );
  const spam_category = overview?.categories.find(
    (entry) => entry.name === "spam",
  );

  const handle_addon_pay_card = async (addon: StorageAddonItem) => {
    if (is_action_loading) return;

    set_is_action_loading(true);
    try {
      const response = await purchase_storage_addon(
        addon.id,
        credit_balance?.balance_cents,
        addon_return_url("success"),
        addon_return_url("cancelled"),
      );
      const url = response.data?.url;

      if (!url) {
        show_toast(t("settings.addon_purchase_failed"), "error");
        set_is_action_loading(false);

        return;
      }

      const is_tauri =
        typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

      if (is_tauri) {
        const core = await import("@tauri-apps/api/core");

        await core.invoke("open_external_url", { url });
        set_is_action_loading(false);
      } else {
        window.location.assign(url);
      }
    } catch {
      show_toast(t("settings.addon_purchase_failed"), "error");
      set_is_action_loading(false);
    }
  };

  const handle_cancel_addon = async (event: React.MouseEvent) => {
    if (!addon_to_cancel) return;

    event.preventDefault();
    set_is_action_loading(true);
    try {
      const response = await cancel_storage_addon(
        addon_to_cancel.user_addon_id,
      );

      if (response.data?.success) {
        show_toast(t("settings.addon_cancelled"), "success");
        request_cache.invalidate("/payments/v1");
        request_cache.invalidate("/sync/v1");
        invalidate_mail_stats();
        await load_data();
      } else {
        show_toast(t("settings.addon_cancel_failed"), "error");
      }
    } catch {
      show_toast(t("settings.addon_cancel_failed"), "error");
    } finally {
      set_is_action_loading(false);
      set_show_cancel_addon_dialog(false);
      set_addon_to_cancel(null);
    }
  };

  const handle_cleanup = async (event: React.MouseEvent) => {
    if (!cleanup_target) return;

    event.preventDefault();
    set_is_action_loading(true);
    try {
      const response =
        cleanup_target === "trash" ? await empty_trash() : await empty_spam();

      if (response.data?.success) {
        show_toast(t("settings.storage_cleanup_done"), "success");
        set_is_action_loading(false);
        set_cleanup_target(null);
        request_cache.invalidate("/sync/v1");
        invalidate_mail_stats();
        load_data();

        return;
      }

      show_toast(t("settings.storage_cleanup_failed"), "error");
    } catch {
      show_toast(t("settings.storage_cleanup_failed"), "error");
    }

    set_is_action_loading(false);
    set_cleanup_target(null);
  };

  if (is_initial_load) {
    return <SettingsSkeleton />;
  }

  if (overview_load_failed && !overview) {
    return (
      <LoadFailedNotice
        on_retry={() => {
          set_is_initial_load(true);
          load_data();
        }}
      />
    );
  }

  const total_items = breakdown_rows.reduce(
    (sum, entry) => sum + entry.item_count,
    0,
  );
  const total_breakdown_bytes = breakdown_rows.reduce(
    (sum, entry) => sum + entry.bytes_used,
    0,
  );

  const donut_rows = breakdown_rows.filter((entry) => entry.bytes_used > 0);
  const focused_row =
    donut_rows.find((entry) => entry.name === active_category) ?? null;
  const donut_segments = build_bar_segments(
    donut_rows.map((entry) =>
      share_of(entry.bytes_used, total_breakdown_bytes),
    ),
  ).reduce<{ name: string; color: string; share: number; offset: number }[]>(
    (acc, share, index) => {
      const previous = acc[acc.length - 1];

      acc.push({
        name: donut_rows[index].name,
        color: style_of(donut_rows[index].name).color,
        share,
        offset: previous ? previous.offset + previous.share : 0,
      });

      return acc;
    },
    [],
  );

  const percent_label =
    percentage > 0 && percentage < 1
      ? t("common.storage_under_one_percent")
      : `${format_decimal(percentage, percentage < 10 ? 1 : 0)}%`;

  const meter_segments = build_bar_segments(
    categories.map((entry) => share_of(entry.bytes_used, total_limit)),
  ).map((share, index) => ({
    name: categories[index].name,
    share,
    color: style_of(categories[index].name).color,
  }));

  return (
    <div className="space-y-8">
      {STORAGE_PROMO_ENABLED &&
        !on_onion &&
        promo?.eligible &&
        available_addons.length > 0 && (
          <div className="rounded-xl bg-surf-secondary border border-edge-secondary px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <TagIcon className="h-5 w-5 flex-shrink-0 text-brand" />
                  <p className="text-sm font-semibold text-txt-primary">
                    {t("settings.storage_promo_title")}
                  </p>
                </div>
                <p className="text-sm text-txt-muted mt-1 ms-7">
                  {(promo.duration_months === 1
                    ? t("settings.storage_promo_body_singular")
                    : t("settings.storage_promo_body")
                  )
                    .replace("{{percent}}", format_number(promo.percent_off))
                    .replace(
                      "{{months}}",
                      format_number(promo.duration_months),
                    )}
                </p>
                <p className="text-xs text-txt-muted mt-1 ms-7">
                  {t("settings.storage_promo_note")}
                </p>
              </div>
              <button
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors text-[var(--accent-fg,#ffffff)] bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)]"
                type="button"
                onClick={() => {
                  document
                    .getElementById("additional_storage_section")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {t("settings.storage_promo_cta")}
              </button>
            </div>
          </div>
        )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="flex items-baseline gap-2.5">
              <span className="text-4xl font-semibold leading-none tabular-nums text-txt-primary">
                {percent_label}
              </span>
              <span className="text-sm text-txt-muted">
                {t("common.storage_used").toLowerCase()}
              </span>
            </p>
            <p className="mt-2.5 text-base text-txt-secondary">
              {t("settings.storage_used_of_total")
                .replace("{{used}}", format_bytes(total_used))
                .replace("{{total}}", format_bytes(total_limit))}
            </p>
          </div>
          <p className="text-sm text-txt-muted">
            {t("settings.storage_available")}{" "}
            <span className="tabular-nums text-txt-primary">
              {format_bytes(available_bytes)}
            </span>
          </p>
        </div>

        <div
          aria-label={t("common.storage_used")}
          className="mt-5 flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full"
          role="img"
          style={{ backgroundColor: "var(--storage-track)" }}
        >
          {meter_segments.map((segment) => (
            <div
              key={segment.name}
              className="transition-[width] duration-500"
              style={{
                width: `${segment.share}%`,
                backgroundColor: segment.color,
              }}
            />
          ))}
        </div>

        {overview?.is_over_limit && (
          <div
            className="mt-6 flex items-start gap-2 rounded-lg border p-3"
            style={{
              borderColor:
                "color-mix(in srgb, var(--color-danger) 40%, transparent)",
              backgroundColor:
                "color-mix(in srgb, var(--color-danger) 10%, transparent)",
            }}
          >
            <ExclamationTriangleIcon
              className="w-4 h-4 mt-0.5 flex-shrink-0"
              style={{ color: "var(--color-danger)" }}
            />
            <div>
              <p className="text-sm font-medium text-txt-primary">
                {t("settings.storage_locked_title")}
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.storage_locked_description")}
              </p>
            </div>
          </div>
        )}
      </section>

      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ChartPieIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.storage_breakdown_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        {total_breakdown_bytes === 0 ? (
          <p className="py-6 text-center text-sm text-txt-muted">
            {t("settings.storage_breakdown_empty")}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-7 sm:flex-row sm:gap-9">
            <div className="relative h-44 w-44 flex-shrink-0">
              <svg
                aria-label={t("settings.storage_breakdown_title")}
                className="h-full w-full -rotate-90"
                role="img"
                viewBox="0 0 42 42"
              >
                <circle
                  cx="21"
                  cy="21"
                  fill="none"
                  r="15.915494"
                  stroke="var(--storage-track)"
                  strokeWidth="3"
                />
                {donut_segments.map((segment) => {
                  const dimmed =
                    active_category !== null &&
                    active_category !== segment.name;

                  return (
                    <circle
                      key={segment.name}
                      className="transition-all duration-300 motion-reduce:transition-none"
                      cx="21"
                      cy="21"
                      fill="none"
                      opacity={dimmed ? 0.25 : 1}
                      r="15.915494"
                      stroke={segment.color}
                      strokeDasharray={`${segment.share} ${Math.max(0, 100 - segment.share)}`}
                      strokeDashoffset={-segment.offset}
                      strokeLinecap="butt"
                      strokeWidth={active_category === segment.name ? 4.5 : 3}
                      onMouseEnter={() => set_active_category(segment.name)}
                      onMouseLeave={() => set_active_category(null)}
                    >
                      <title>{t(style_of(segment.name).label_key)}</title>
                    </circle>
                  );
                })}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <span className="text-3xl font-semibold tabular-nums text-txt-primary">
                  {format_bytes(
                    focused_row
                      ? focused_row.bytes_used
                      : total_breakdown_bytes,
                  )}
                </span>
                <span className="mt-1.5 truncate text-xs text-txt-muted">
                  {focused_row
                    ? t(style_of(focused_row.name).label_key)
                    : t("settings.storage_items_count", { count: total_items })}
                </span>
              </div>
            </div>

            <div className="w-full min-w-0 flex-1 divide-y divide-edge-secondary">
              {breakdown_rows.map((entry) => {
                const style = style_of(entry.name);
                const row_share = share_of(
                  entry.bytes_used,
                  total_breakdown_bytes,
                );
                const is_cleanable =
                  entry.name === "trash" || entry.name === "spam";
                const is_busy =
                  is_action_loading && cleanup_target === entry.name;

                return (
                  <div
                    key={entry.name}
                    className={`flex items-center gap-3 py-2.5 transition-opacity duration-200 motion-reduce:transition-none ${
                      active_category !== null && active_category !== entry.name
                        ? "opacity-40"
                        : "opacity-100"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          entry.bytes_used > 0
                            ? style.color
                            : "var(--storage-track)",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-txt-primary">
                      {t(style.label_key)}
                    </span>
                    {is_cleanable && entry.item_count > 0 && (
                      <button
                        aria-busy={is_busy}
                        aria-label={
                          entry.name === "spam"
                            ? t("mail.empty_spam")
                            : t("mail.empty_trash")
                        }
                        className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-brand transition-colors hover:bg-surf-tertiary disabled:cursor-default disabled:hover:bg-transparent"
                        disabled={is_action_loading}
                        type="button"
                        onClick={() =>
                          set_cleanup_target(
                            entry.name === "spam" ? "spam" : "trash",
                          )
                        }
                      >
                        <span className="relative inline-flex items-center justify-center">
                          <span className={is_busy ? "invisible" : undefined}>
                            {entry.name === "spam"
                              ? t("mail.empty_spam")
                              : t("mail.empty_trash")}
                          </span>
                          {is_busy && (
                            <Spinner className="absolute" size="xs" />
                          )}
                        </span>
                      </button>
                    )}
                    <span className="hidden flex-shrink-0 text-end text-xs tabular-nums text-txt-muted sm:block">
                      {entry.item_count > 0
                        ? t("settings.storage_items_count", {
                            count: entry.item_count,
                          })
                        : ""}
                    </span>
                    <span className="w-11 flex-shrink-0 text-end text-xs tabular-nums text-txt-muted">
                      {row_share > 0
                        ? `${format_decimal(row_share, row_share < 10 ? 1 : 0)}%`
                        : ""}
                    </span>
                    <span
                      className={`w-20 flex-shrink-0 text-end text-sm tabular-nums ${entry.bytes_used > 0 ? "text-txt-primary" : "text-txt-muted"}`}
                    >
                      {format_bytes(entry.bytes_used)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <CircleStackIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.storage_capacity_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-txt-muted">
                {t("settings.storage_total_capacity")}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-txt-primary">
                {format_bytes(total_limit)}
              </p>
            </div>
          </div>

          {capacity_sources.length > 1 && (
            <div
              className="mt-5 flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--storage-track)" }}
            >
              {capacity_sources.map((source) => (
                <div
                  key={source.key}
                  style={{
                    width: `${source.bar_share}%`,
                    backgroundColor: source.color,
                  }}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            {capacity_sources.map((source) => (
              <span
                key={source.key}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: source.color }}
                />
                <span className="text-txt-secondary">
                  {t(source.label_key)}
                </span>
                <span className="tabular-nums text-txt-primary">
                  {format_bytes(source.bytes)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <StorageFormatPicker
        on_change={handle_storage_format_change}
        storage_format={storage_format}
      />

      {!on_onion && (
        <StorageAddonsSection
          active_addons={active_addons}
          available_addons={available_addons}
          is_action_loading={is_action_loading}
          on_cancel_addon={(addon) => {
            set_addon_to_cancel(addon);
            set_show_cancel_addon_dialog(true);
          }}
          on_purchase_addon={(addon) => {
            set_addon_method_target(addon);
            set_show_addon_method_modal(true);
          }}
          preferred_currency={preferred_currency}
          selected_storage={selected_storage}
          set_selected_storage={set_selected_storage}
        />
      )}

      {addon_method_target && (
        <PlanPaymentMethodModal
          busy={is_action_loading}
          credit_balance_cents={credit_balance?.balance_cents}
          discount_duration_months={
            promo?.eligible ? promo.duration_months : undefined
          }
          discount_percent_off={promo?.eligible ? promo.percent_off : undefined}
          on_choose_card={() => {
            const addon = addon_method_target;

            set_show_addon_method_modal(false);
            set_addon_method_target(null);
            if (addon) handle_addon_pay_card(addon);
          }}
          on_choose_crypto={() => {
            const addon = addon_method_target;

            set_show_addon_method_modal(false);
            set_addon_method_target(null);
            if (addon) {
              set_crypto_addon(addon);
              set_show_crypto_addon_modal(true);
            }
          }}
          on_close={() => {
            set_show_addon_method_modal(false);
            set_addon_method_target(null);
          }}
          open={show_addon_method_modal}
          plan_name={addon_method_target.name}
        />
      )}

      {crypto_addon && (
        <CryptoAddonTermModal
          addon_id={crypto_addon.id}
          addon_name={crypto_addon.name}
          is_open={show_crypto_addon_modal}
          on_close={() => {
            const addon = crypto_addon;

            set_show_crypto_addon_modal(false);
            set_crypto_addon(null);
            set_addon_method_target(addon);
            set_show_addon_method_modal(true);
          }}
          preferred_currency={preferred_currency}
          price_cents={crypto_addon.price_cents}
        />
      )}

      <AlertDialog
        open={show_cancel_addon_dialog}
        onOpenChange={set_show_cancel_addon_dialog}
      >
        <AlertDialogContent
          on_overlay_click={() => set_show_cancel_addon_dialog(false)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.confirm_cancel_addon")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.confirm_cancel_addon_description")}
              {addon_to_cancel && (
                <span className="block mt-2 font-medium text-txt-primary">
                  {addon_to_cancel.size_label} -{" "}
                  {format_price(
                    convert_cents(
                      addon_to_cancel.price_cents,
                      preferred_currency,
                    ),
                    preferred_currency,
                  )}
                  {t("settings.per_month_short")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
            <AlertDialogCancel className="max-sm:flex-1">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive max-sm:flex-1"
              onClick={handle_cancel_addon}
            >
              {is_action_loading ? (
                <Spinner size="sm" />
              ) : (
                t("settings.confirm_cancel_addon")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cleanup_target !== null}
        onOpenChange={(open) => {
          if (!open && !is_action_loading) set_cleanup_target(null);
        }}
      >
        <AlertDialogContent
          on_overlay_click={() => {
            if (!is_action_loading) set_cleanup_target(null);
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cleanup_view === "spam"
                ? t("mail.empty_spam")
                : t("mail.empty_trash")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.storage_cleanup_confirm")
                .replace(
                  "{{count}}",
                  format_number(
                    (cleanup_view === "spam"
                      ? spam_category?.item_count
                      : trash_category?.item_count) ?? 0,
                  ),
                )
                .replace(
                  "{{size}}",
                  format_bytes(
                    (cleanup_view === "spam"
                      ? spam_category?.bytes_used
                      : trash_category?.bytes_used) ?? 0,
                  ),
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
            <AlertDialogCancel
              className="max-sm:flex-1"
              disabled={is_action_loading}
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive max-sm:flex-1"
              disabled={is_action_loading}
              onClick={handle_cleanup}
            >
              {is_action_loading ? <Spinner size="sm" /> : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
