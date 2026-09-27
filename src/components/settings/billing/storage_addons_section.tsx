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
import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";
import {
  format_date,
  format_price,
  format_storage,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import {
  ADDON_BADGES,
  convert_cents,
} from "@/components/settings/billing/billing_constants";
import {
  BillingGroup,
  BillingRow,
  BillingSectionLabel,
} from "@/components/settings/billing/billing_layout";
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

  const handle_buy = () => {
    const addon = available_addons.find((a) => a.id === selected_storage);

    if (!addon) {
      show_toast(t("settings.storage_select_option_first"), "info");

      return;
    }

    on_purchase_addon(addon);
  };

  return (
    <section id="additional_storage_section">
      <BillingSectionLabel>{t("settings.storage")}</BillingSectionLabel>
      <BillingGroup>
        <BillingRow
          action={
            <button
              aria-expanded={is_picker_open}
              className="aster_btn aster_btn_secondary aster_btn_sm"
              type="button"
              onClick={() => set_is_picker_open((open) => !open)}
            >
              {is_picker_open ? t("common.close") : t("settings.add_storage")}
            </button>
          }
          description={
            has_usage ? (
              <div className="space-y-2">
                <p>
                  {t("settings.storage_used_of_total", {
                    used: format_storage(storage_used_bytes),
                    total: format_storage(storage_limit_bytes),
                  })}
                </p>
                <Progress
                  className={`h-1.5 max-w-xs ${is_over_limit ? "[&>div]:bg-red-500" : ""}`}
                  value={storage_percentage ?? 0}
                />
              </div>
            ) : (
              t("settings.storage_addons_description")
            )
          }
          title={t("settings.storage_addons")}
        >
          {is_picker_open && (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {available_addons.map((addon) => {
                  const badge = ADDON_BADGES[addon.name];
                  const is_selected = selected_storage === addon.id;

                  return (
                    <button
                      key={addon.id}
                      aria-pressed={is_selected}
                      className={`rounded-lg border px-3 py-2.5 text-start transition-colors ${
                        is_selected
                          ? "border-txt-primary bg-surf-hover"
                          : "border-edge-secondary hover:bg-surf-hover"
                      }`}
                      type="button"
                      onClick={() =>
                        set_selected_storage(is_selected ? null : addon.id)
                      }
                    >
                      <p className="text-sm font-semibold text-txt-primary">
                        {addon.name}
                      </p>
                      <p className="mt-0.5 text-xs text-txt-muted">
                        {format_price(
                          convert_cents(addon.price_cents, preferred_currency),
                          preferred_currency,
                        )}
                        {t("settings.per_month_short")}
                      </p>
                      {badge && (
                        <p className="mt-1 text-[11px] font-medium text-txt-secondary">
                          {badge === "popular"
                            ? t("settings.popular")
                            : t("settings.best_value")}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-txt-muted">
                  {t("settings.storage_addons_monthly_note")}
                </p>
                <button
                  className="aster_btn aster_btn_primary aster_btn_sm flex-shrink-0 self-start sm:self-auto"
                  disabled={is_action_loading}
                  type="button"
                  onClick={handle_buy}
                >
                  {t("common.buy_more_storage")}
                </button>
              </div>
            </div>
          )}
        </BillingRow>

        {active_addons.map((addon) => (
          <BillingRow
            key={addon.user_addon_id}
            action={
              !addon.cancel_at_period_end && (
                <button
                  className="aster_btn aster_btn_secondary aster_btn_sm"
                  disabled={is_action_loading}
                  type="button"
                  onClick={() => on_cancel_addon(addon)}
                >
                  {t("settings.cancel_addon")}
                </button>
              )
            }
            description={
              <>
                {format_price(
                  convert_cents(addon.price_cents, preferred_currency),
                  preferred_currency,
                )}
                {t("settings.per_month_short")}
                {addon.cancel_at_period_end && addon.current_period_end && (
                  <>
                    <span aria-hidden="true" className="mx-1.5">
                      ·
                    </span>
                    {t("settings.cancels")}{" "}
                    {format_date(addon.current_period_end)}
                  </>
                )}
              </>
            }
            title={addon.size_label}
          />
        ))}
      </BillingGroup>
    </section>
  );
}
