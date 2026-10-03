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
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { CircleStackIcon } from "@heroicons/react/24/outline";
import {
  Badge,
  Button,
  Island,
  IslandDivider,
  IslandRow,
  IslandSection,
  PillButton,
} from "@aster/ui";

import {
  format_date,
  format_price,
  type AddonBillingInterval,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import {
  ADDON_BADGES,
  ADDON_SUPERNOVA_NUDGE_BYTES,
  convert_cents,
} from "@/components/settings/billing/billing_constants";
import {
  catalog_has_yearly,
  catalog_yearly_save_percent,
  default_addon_interval,
  featured_addon_id,
  storage_usage_is_high,
  yearly_save_percent,
} from "@/components/settings/billing/storage_addon_pricing";
import { BillingMeter } from "@/components/settings/billing/billing_meter";
import { monthly_equivalent_cents } from "@/components/settings/billing/yearly_switch_card";
import {
  BillingMoreRow,
  billing_row_icon,
} from "@/components/settings/billing/billing_more_section";
import { use_i18n } from "@/lib/i18n/context";
import { show_upgrade_plans } from "@/stores/upgrade_store";

export const OPEN_STORAGE_ADDONS_EVENT = "aster:open-storage-addons";

interface StorageAddonsSectionProps {
  available_addons: StorageAddonItem[];
  active_addons: UserActiveAddon[];
  selected_storage: string | null;
  set_selected_storage: (value: string | null) => void;
  is_action_loading: boolean;
  on_cancel_addon: (addon: UserActiveAddon) => void;
  on_purchase_addon: (addon: StorageAddonItem) => void;
  preferred_currency: string;
  storage_used_bytes?: number;
  storage_limit_bytes?: number;
  storage_percentage?: number;
  is_over_limit?: boolean;
  embedded?: boolean;
  current_plan_code?: string;
}

function AddonCard({
  featured,
  children,
}: {
  featured: boolean;
  children: ReactNode;
}) {
  if (featured) {
    return (
      <Island
        className="flex flex-col gap-4 p-4"
        data-featured="true"
        tone="accent"
      >
        {children}
      </Island>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-[var(--aster-radius-control)] p-4"
      style={{ backgroundColor: "var(--aster-field-bg)" }}
    >
      {children}
    </div>
  );
}

export function StorageAddonsSection({
  available_addons,
  active_addons,
  selected_storage,
  set_selected_storage,
  is_action_loading,
  on_cancel_addon,
  on_purchase_addon,
  preferred_currency,
  storage_used_bytes,
  storage_limit_bytes,
  storage_percentage,
  is_over_limit = false,
  embedded = false,
  current_plan_code,
}: StorageAddonsSectionProps) {
  const { t } = use_i18n();
  const [is_picker_open, set_is_picker_open] = useState(false);
  const [chosen_interval, set_chosen_interval] =
    useState<AddonBillingInterval | null>(null);
  const has_usage =
    storage_used_bytes !== undefined && storage_limit_bytes !== undefined;
  const usage_high =
    has_usage && storage_usage_is_high(storage_percentage, is_over_limit);
  const usage_full = is_over_limit || (storage_percentage ?? 0) >= 100;

  useEffect(() => {
    const open_picker = () => set_is_picker_open(true);

    window.addEventListener(OPEN_STORAGE_ADDONS_EVENT, open_picker);

    return () =>
      window.removeEventListener(OPEN_STORAGE_ADDONS_EVENT, open_picker);
  }, []);

  useEffect(() => {
    if (usage_high) set_is_picker_open(true);
  }, [usage_high]);

  const purchasable_addons = available_addons.filter(
    (addon) => addon.storage_bytes > 0 && addon.price_cents > 0,
  );
  const yearly_available = catalog_has_yearly(purchasable_addons);
  const billing_interval =
    chosen_interval ?? default_addon_interval(purchasable_addons);
  const is_yearly = yearly_available && billing_interval === "year";
  const yearly_save = yearly_available
    ? catalog_yearly_save_percent(purchasable_addons)
    : 0;
  const featured_id = featured_addon_id(purchasable_addons);
  const show_supernova_nudge =
    current_plan_code !== "supernova" &&
    purchasable_addons.some(
      (addon) => addon.storage_bytes >= ADDON_SUPERNOVA_NUDGE_BYTES,
    );

  const handle_buy = (addon: StorageAddonItem) => {
    set_selected_storage(addon.id);
    on_purchase_addon({
      ...addon,
      billing_interval: is_yearly ? "year" : "month",
    });
  };

  const money = (cents: number) =>
    format_price(convert_cents(cents, preferred_currency), preferred_currency);

  const local_money = (cents: number) =>
    format_price(cents, preferred_currency);

  const billing_note = is_yearly
    ? t("settings.storage_addons_yearly_note")
    : t("settings.storage_addons_monthly_note");

  const usage_nudge = usage_high && (
    <p className="text-[13px] leading-5 text-txt-secondary">
      {usage_full
        ? t("settings.storage_addon_usage_full")
        : t("settings.storage_addon_usage_near")}
    </p>
  );

  const period_switch = yearly_available && (
    <div
      aria-label={t("settings.billing_term_heading")}
      className="aster_segmented self-start"
      role="group"
    >
      {(["month", "year"] as const).map((interval) => (
        <button
          key={interval}
          aria-pressed={interval === "year" ? is_yearly : !is_yearly}
          className="aster_segmented_option"
          type="button"
          onClick={() => set_chosen_interval(interval)}
        >
          {interval === "year"
            ? t("settings.billing_yearly")
            : t("settings.billing_monthly")}
          {interval === "year" && yearly_save > 0 && (
            <span
              className="ms-1.5 text-[11.5px] font-semibold"
              style={{
                color: is_yearly ? "inherit" : "var(--color-success)",
              }}
            >
              {t("settings.billing_save_percent", {
                percent: yearly_save,
              })}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const badge_label = (badge: "popular" | "best_value") =>
    badge === "popular" ? t("settings.popular") : t("settings.best_value");

  const render_card = (addon: StorageAddonItem) => {
    const badge = ADDON_BADGES[addon.name];
    const is_featured = addon.id === featured_id;
    const yearly_cents = is_yearly
      ? convert_cents(addon.yearly_price_cents as number, preferred_currency)
      : 0;
    const headline_cents = is_yearly
      ? monthly_equivalent_cents(yearly_cents)
      : convert_cents(addon.price_cents, preferred_currency);
    const save = is_yearly
      ? yearly_save_percent(addon.price_cents, addon.yearly_price_cents)
      : 0;

    return (
      <AddonCard key={addon.id} featured={is_featured}>
        <div className="flex flex-col gap-1">
          <div className="flex min-h-[22px] items-center justify-between gap-2">
            <h5 className="text-[17px] font-semibold leading-6 tabular-nums text-txt-primary">
              {addon.name}
            </h5>
            {badge &&
              (is_featured ? (
                <span
                  className="inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: "var(--accent-color)",
                    color: "var(--accent-fg, #ffffff)",
                  }}
                >
                  {badge_label(badge)}
                </span>
              ) : (
                <Badge className="flex-shrink-0 whitespace-nowrap" color="blue">
                  {badge_label(badge)}
                </Badge>
              ))}
          </div>
          <p className="flex items-baseline gap-1">
            <span className="text-[26px] font-semibold tabular-nums leading-8 tracking-tight text-txt-primary">
              {local_money(headline_cents)}
            </span>
            <span className="text-[13px] text-txt-muted">
              {t("settings.per_month_short")}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-txt-muted">
            <span>
              {is_yearly
                ? t("settings.billing_billed_yearly_total", {
                    amount: local_money(yearly_cents),
                  })
                : t("settings.billing_billed_monthly")}
            </span>
            {save > 0 && (
              <span
                className="font-medium"
                style={{ color: "var(--color-success)" }}
              >
                {t("settings.billing_save_percent", { percent: save })}
              </span>
            )}
          </p>
        </div>

        <Button
          className="w-full"
          disabled={is_action_loading}
          is_loading={is_action_loading && selected_storage === addon.id}
          size="lg"
          type="button"
          variant={is_featured ? "primary" : "secondary"}
          onClick={() => handle_buy(addon)}
        >
          {t("settings.storage_addon_add_size", { size: addon.name })}
        </Button>
      </AddonCard>
    );
  };

  const picker = (
    <div className="flex flex-col gap-4">
      {embedded && has_usage && (
        <div className="flex flex-col gap-2">
          <BillingMeter
            label={t("settings.storage")}
            limit_bytes={storage_limit_bytes}
            over_limit={is_over_limit}
            percent={storage_percentage ?? 0}
            used_bytes={storage_used_bytes}
          />
          {usage_nudge}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-medium text-txt-primary">
          {t("settings.bill_addon_pick_size")}
        </p>
        {period_switch}
      </div>
      <div
        aria-label={t("settings.add_storage")}
        className={`grid items-start gap-3 sm:grid-cols-3 ${
          purchasable_addons.length > 3 ? "grid-cols-2" : "grid-cols-1"
        }`}
        role="group"
      >
        {purchasable_addons.map(render_card)}
      </div>
      {show_supernova_nudge && (
        <p className="text-[12.5px] leading-5 text-txt-muted">
          {t("settings.storage_addon_supernova_nudge")}{" "}
          <button
            className="font-medium text-[var(--accent-color)] hover:underline focus:outline-none focus-visible:underline"
            type="button"
            onClick={() =>
              show_upgrade_plans({
                interval: is_yearly ? "year" : "month",
                plan_code: "supernova",
              })
            }
          >
            {t("settings.upgrade_view_plans")}
          </button>
        </p>
      )}
      <p className="text-[12px] leading-5 text-txt-muted">{billing_note}</p>
    </div>
  );

  const active_rows = active_addons.map((addon, index) => {
    const ending = addon.cancel_at_period_end && !!addon.current_period_end;

    return (
      <Fragment key={addon.user_addon_id}>
        {index > 0 && <IslandDivider />}
        <IslandRow
          description={
            ending
              ? t("settings.billing_addon_ends", {
                  date: format_date(addon.current_period_end!),
                })
              : `${money(addon.price_cents)}${
                  addon.billing_period === "year"
                    ? t("settings.per_year_short")
                    : t("settings.per_month_short")
                }`
          }
          icon={<CircleStackIcon className="h-[22px] w-[22px]" />}
          label={addon.size_label}
          trailing={
            <span className="flex items-center gap-2">
              <span
                className="text-[12px] font-medium"
                style={{
                  color: ending
                    ? "var(--color-warning)"
                    : "var(--color-success)",
                }}
              >
                {ending
                  ? t("settings.billing_addon_ending")
                  : t("settings.billing_addon_active")}
              </span>
              {!addon.cancel_at_period_end && (
                <PillButton
                  disabled={is_action_loading}
                  size="sm"
                  type="button"
                  variant="neutral"
                  onClick={() => on_cancel_addon(addon)}
                >
                  {t("settings.cancel_addon")}
                </PillButton>
              )}
            </span>
          }
        />
      </Fragment>
    );
  });

  if (embedded) {
    return (
      <BillingMoreRow
        flush
        description={t("settings.billing_addons_subtitle")}
        icon={billing_row_icon(CircleStackIcon)}
        id="additional_storage_section"
        label={t("settings.add_storage")}
        on_toggle={() => set_is_picker_open((open) => !open)}
        open={is_picker_open}
        value={
          active_addons.length > 0
            ? t("settings.billing_addons_active_count", {
                count: active_addons.length,
              })
            : undefined
        }
      >
        <div className="px-4 pb-4 pt-3">{picker}</div>
        {active_addons.length > 0 && (
          <>
            <IslandDivider />
            {active_rows}
          </>
        )}
      </BillingMoreRow>
    );
  }

  return (
    <IslandSection
      bare
      id="additional_storage_section"
      title={t("settings.storage")}
      trailing={
        <PillButton
          aria-expanded={is_picker_open}
          size="sm"
          type="button"
          variant={is_picker_open ? "neutral" : "tonal"}
          onClick={() => set_is_picker_open((open) => !open)}
        >
          {is_picker_open ? t("common.close") : t("settings.add_storage")}
        </PillButton>
      }
    >
      <div className="flex flex-col gap-3">
        <Island padding="md">
          {has_usage ? (
            <div className="flex flex-col gap-2">
              <BillingMeter
                label={t("settings.storage_addons")}
                limit_bytes={storage_limit_bytes}
                over_limit={is_over_limit}
                percent={storage_percentage ?? 0}
                used_bytes={storage_used_bytes}
              />
              {usage_nudge}
            </div>
          ) : (
            <p className="text-[13px] leading-5 text-txt-muted">
              {t("settings.storage_addons_description")}
            </p>
          )}

          {is_picker_open && <div className="mt-4">{picker}</div>}
        </Island>

        {active_addons.length > 0 && (
          <Island className="overflow-hidden" padding="none">
            {active_rows}
          </Island>
        )}
      </div>
    </IslandSection>
  );
}
