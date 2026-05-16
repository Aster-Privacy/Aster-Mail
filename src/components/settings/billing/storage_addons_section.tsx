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
import { CircleStackIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  format_price,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import { ADDON_BADGES } from "@/components/settings/billing/billing_constants";
import { use_i18n } from "@/lib/i18n/context";

interface StorageAddonsSectionProps {
  available_addons: StorageAddonItem[];
  active_addons: UserActiveAddon[];
  selected_storage: string | null;
  set_selected_storage: (value: string | null) => void;
  is_action_loading: boolean;
  on_cancel_addon: (addon: UserActiveAddon) => void;
  on_purchase_addon: (addon: StorageAddonItem) => void;
}

export function StorageAddonsSection({
  available_addons,
  active_addons,
  selected_storage,
  set_selected_storage,
  is_action_loading,
  on_cancel_addon,
  on_purchase_addon,
}: StorageAddonsSectionProps) {
  const { t } = use_i18n();

  return (
    <div className="pt-4" id="additional_storage_section">
      <div className="mb-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <CircleStackIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.storage_addons")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <p className="text-sm mb-3 text-txt-muted">
        {t("settings.storage_addons_description")}
      </p>

      {active_addons.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-txt-secondary mb-2">
            {t("settings.active_addons")}
          </h4>
          <div className="space-y-2">
            {active_addons.map((addon) => (
              <div
                key={addon.user_addon_id}
                className="flex items-center justify-between p-3 rounded-lg bg-surf-tertiary border border-edge-secondary"
              >
                <div>
                  <p className="text-sm font-medium text-txt-primary">
                    {addon.size_label}
                  </p>
                  <p className="text-xs text-txt-muted">
                    {format_price(addon.price_cents)}
                    {t("settings.per_month_short")}
                  </p>
                  {addon.cancel_at_period_end && addon.current_period_end && (
                    <p className="text-xs text-amber-500 mt-0.5">
                      {t("settings.cancels")}{" "}
                      {new Date(addon.current_period_end).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {!addon.cancel_at_period_end && (
                  <Button
                    disabled={is_action_loading}
                    size="sm"
                    variant="ghost"
                    onClick={() => on_cancel_addon(addon)}
                  >
                    {t("settings.cancel_addon")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {available_addons.map((addon) => {
          const badge = ADDON_BADGES[addon.name];

          return (
            <button
              key={addon.id}
              className="relative p-3 rounded-[14px] border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor:
                  selected_storage === addon.id
                    ? "rgba(59, 130, 246, 0.06)"
                    : "var(--bg-tertiary)",
                borderColor:
                  selected_storage === addon.id
                    ? "var(--color-info)"
                    : "var(--border-secondary)",
                boxShadow:
                  selected_storage === addon.id
                    ? "0 0 0 1px rgba(59, 130, 246, 0.3)"
                    : "none",
              }}
              onClick={() =>
                set_selected_storage(
                  selected_storage === addon.id ? null : addon.id,
                )
              }
            >
              {badge && (
                <span
                  className="absolute -top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{
                    backgroundColor: "#1d4ed8",
                  }}
                >
                  {badge === "popular"
                    ? t("settings.popular")
                    : t("settings.best_value")}
                </span>
              )}
              <p className="text-base font-bold text-txt-primary">
                {addon.name}
              </p>
              <p className="text-xs text-txt-muted mt-0.5">
                {format_price(addon.price_cents)}
                {t("settings.per_month_short")}
              </p>
            </button>
          );
        })}
      </div>

      <Button
        className="w-full mt-3"
        disabled={!selected_storage || is_action_loading}
        size="xl"
        variant="depth"
        onClick={() => {
          if (!selected_storage) return;
          const addon = available_addons.find((a) => a.id === selected_storage);

          if (addon) {
            on_purchase_addon(addon);
          }
        }}
      >
        {t("settings.add_storage")}
      </Button>
    </div>
  );
}
