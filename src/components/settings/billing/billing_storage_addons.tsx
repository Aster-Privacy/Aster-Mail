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
import { Button } from "@aster/ui";

import {
  BILLING_CARD_CLASS,
  BillingOptionRowsSkeleton,
} from "@/components/settings/billing/billing_skeleton";
import { convert_cents } from "@/components/settings/billing/billing_constants";
import {
  format_date,
  format_price,
  format_storage,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

interface BillingStorageAddonsProps {
  available_addons: StorageAddonItem[];
  active_addons: UserActiveAddon[];
  selected_storage: string | null;
  set_selected_storage: (value: string | null) => void;
  is_action_loading: boolean;
  is_loading: boolean;
  preferred_currency: string;
  on_cancel_addon: (addon: UserActiveAddon) => void;
  on_purchase_addon: (addon: StorageAddonItem) => void;
}

export function BillingStorageAddons({
  available_addons,
  active_addons,
  selected_storage,
  set_selected_storage,
  is_action_loading,
  is_loading,
  preferred_currency,
  on_cancel_addon,
  on_purchase_addon,
}: BillingStorageAddonsProps) {
  const { t } = use_i18n();
  const money = (cents: number) =>
    format_price(convert_cents(cents, preferred_currency), preferred_currency);

  if (
    !is_loading &&
    available_addons.length === 0 &&
    active_addons.length === 0
  )
    return null;

  const selected =
    available_addons.find((addon) => addon.id === selected_storage) ??
    available_addons[0] ??
    null;

  return (
    <div className="space-y-3" id="additional_storage_section">
      <h3 className="text-base font-semibold text-txt-primary">
        {t("settings.bill_add_more_storage")}
      </h3>

      {is_loading && available_addons.length === 0 ? (
        <BillingOptionRowsSkeleton rows={3} />
      ) : (
        <>
          {active_addons.length > 0 && (
            <div className={`${BILLING_CARD_CLASS} py-1`}>
              {active_addons.map((addon) => (
                <div
                  key={addon.user_addon_id}
                  className="flex min-h-[54px] items-center gap-3 px-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-txt-primary">
                      {addon.size_label}
                    </span>
                    <span className="block text-[13px] text-txt-muted">
                      {addon.cancel_at_period_end && addon.current_period_end
                        ? t("settings.bill_cancels_on", {
                            date: format_date(addon.current_period_end),
                          })
                        : `${money(addon.price_cents)}${t("settings.per_month_short")}`}
                    </span>
                  </span>
                  {!addon.cancel_at_period_end && (
                    <button
                      className="text-sm font-semibold hover:underline disabled:opacity-50"
                      disabled={is_action_loading}
                      style={{ color: "var(--color-danger)" }}
                      type="button"
                      onClick={() => on_cancel_addon(addon)}
                    >
                      {t("common.cancel")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {available_addons.length > 0 && (
            <div className={`${BILLING_CARD_CLASS} space-y-4 p-4`}>
              <div
                aria-label={t("settings.bill_add_more_storage")}
                className="flex flex-wrap gap-2"
                role="radiogroup"
              >
                {available_addons.map((addon) => {
                  const is_selected = selected?.id === addon.id;

                  return (
                    <button
                      key={addon.id}
                      aria-checked={is_selected}
                      className="rounded-full border px-[14px] py-[8px] text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={is_action_loading}
                      role="radio"
                      style={{
                        backgroundColor: is_selected
                          ? "var(--accent-blue)"
                          : "transparent",
                        borderColor: is_selected
                          ? "var(--accent-blue)"
                          : "var(--border-secondary)",
                        color: is_selected
                          ? "#ffffff"
                          : "var(--text-secondary)",
                        fontWeight: is_selected ? 600 : 500,
                      }}
                      type="button"
                      onClick={() => set_selected_storage(addon.id)}
                    >
                      {addon.storage_bytes > 0
                        ? format_storage(addon.storage_bytes)
                        : addon.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[15px] font-medium text-txt-primary">
                  {selected
                    ? t("settings.bill_addon_summary", {
                        size:
                          selected.storage_bytes > 0
                            ? format_storage(selected.storage_bytes)
                            : selected.name,
                      })
                    : t("settings.bill_addon_pick_size")}
                </span>
                {selected && (
                  <span className="text-right">
                    <span className="block text-[15px] font-semibold text-txt-primary">
                      {money(selected.price_cents)}
                    </span>
                    <span className="block text-xs text-txt-muted">
                      {t("settings.per_month_short")}
                    </span>
                  </span>
                )}
              </div>
              <Button
                className="w-full"
                disabled={!selected || is_action_loading}
                size="md"
                variant="depth"
                onClick={() => selected && on_purchase_addon(selected)}
              >
                {t("settings.bill_buy")}
              </Button>
              <p className="text-center text-xs text-txt-muted">
                {t("settings.storage_addons_monthly_note")}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
