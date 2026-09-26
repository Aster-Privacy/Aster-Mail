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
import { Fragment, useEffect, useState } from "react";
import { CircleStackIcon } from "@heroicons/react/24/outline";
import {
  Island,
  IslandDivider,
  IslandRow,
  IslandSection,
  PillButton,
} from "@aster/ui";

import {
  format_date,
  format_price,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import {
  ADDON_BADGES,
  convert_cents,
} from "@/components/settings/billing/billing_constants";
import { BillingMeter } from "@/components/settings/billing/billing_meter";
import {
  BillingMoreRow,
  billing_row_icon,
} from "@/components/settings/billing/billing_more_section";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

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
}: StorageAddonsSectionProps) {
  const { t } = use_i18n();
  const [is_picker_open, set_is_picker_open] = useState(false);
  const has_usage =
    storage_used_bytes !== undefined && storage_limit_bytes !== undefined;

  useEffect(() => {
    const open_picker = () => set_is_picker_open(true);

    window.addEventListener(OPEN_STORAGE_ADDONS_EVENT, open_picker);

    return () =>
      window.removeEventListener(OPEN_STORAGE_ADDONS_EVENT, open_picker);
  }, []);

  const selected_addon =
    available_addons.find((addon) => addon.id === selected_storage) ?? null;

  const handle_buy = () => {
    if (!selected_addon) {
      show_toast(t("settings.storage_select_option_first"), "info");

      return;
    }

    on_purchase_addon(selected_addon);
  };

  const money = (cents: number) =>
    format_price(convert_cents(cents, preferred_currency), preferred_currency);

  const picker = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {available_addons.map((addon) => {
          const badge = ADDON_BADGES[addon.name];
          const is_selected = selected_storage === addon.id;

          return (
            <PillButton
              key={addon.id}
              aria-checked={is_selected}
              role="radio"
              size="md"
              type="button"
              variant={is_selected ? "filled" : "tonal"}
              onClick={() =>
                set_selected_storage(is_selected ? null : addon.id)
              }
            >
              {addon.name}
              {badge && (
                <span className="ms-1.5 text-[11px] font-medium opacity-80">
                  {badge === "popular"
                    ? t("settings.popular")
                    : t("settings.best_value")}
                </span>
              )}
            </PillButton>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-txt-primary">
            {selected_addon
              ? t("settings.billing_add_storage_summary", {
                  size: selected_addon.name,
                })
              : t("settings.storage_select_option_first")}
          </p>
          <p className="mt-0.5 text-[13px] text-txt-muted">
            {selected_addon
              ? `${money(selected_addon.price_cents)}${t("settings.per_month_short")}`
              : t("settings.storage_addons_monthly_note")}
          </p>
        </div>
        <PillButton
          className="flex-shrink-0 self-start sm:self-auto"
          disabled={is_action_loading || !selected_addon}
          size="md"
          type="button"
          variant="filled"
          onClick={handle_buy}
        >
          {t("common.buy_more_storage")}
        </PillButton>
      </div>
      {selected_addon && (
        <p className="text-[12px] text-txt-muted">
          {t("settings.storage_addons_monthly_note")}
        </p>
      )}
    </div>
  );

  const active_rows = active_addons.map((addon, index) => {
    const ending = addon.cancel_at_period_end && !!addon.current_period_end;

    return (
      <Fragment key={addon.user_addon_id}>
        {index > 0 && <IslandDivider inset={52} />}
        <IslandRow
          description={
            ending
              ? t("settings.billing_addon_ends", {
                  date: format_date(addon.current_period_end!),
                })
              : `${money(addon.price_cents)}${t("settings.per_month_short")}`
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
            <BillingMeter
              label={t("settings.storage_addons")}
              limit_bytes={storage_limit_bytes}
              over_limit={is_over_limit}
              percent={storage_percentage ?? 0}
              used_bytes={storage_used_bytes}
            />
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
