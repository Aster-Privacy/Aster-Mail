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
import type { SettingsSection } from "@/components/settings/settings_content";

import { memo } from "react";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { PanelToggleIcon, Tooltip } from "@aster/ui";

import { scroll_to_storage_addons } from "@/components/layout/storage_meter";
import { format_bytes, format_decimal } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

const CRITICAL_STORAGE_PERCENT = 90;
export const STORAGE_VISIBLE_PERCENT = 80;

const footer_row_class =
  "flex items-center h-8 rounded-[10px] text-txt-secondary hover:text-txt-primary hover:bg-[var(--aster-hover,var(--bg-hover))]";

interface SidebarAccountSwitcherProps {
  is_collapsed: boolean;
  storage_percentage: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
  on_settings_click: (section?: SettingsSection) => void;
  on_modal_open?: () => void;
  on_toggle_collapse?: () => void;
}

interface SidebarStorageProps {
  storage_percentage: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
  on_open: () => void;
  on_buy_more: () => void;
}

const SidebarStorage = memo(function SidebarStorage({
  storage_percentage,
  storage_used_bytes,
  storage_total_bytes,
  on_open,
  on_buy_more,
}: SidebarStorageProps) {
  const { t } = use_i18n();

  if (
    storage_total_bytes <= 0 ||
    storage_percentage <= STORAGE_VISIBLE_PERCENT
  ) {
    return null;
  }

  const is_critical = storage_percentage >= CRITICAL_STORAGE_PERCENT;
  const percent_text =
    storage_percentage > 0 && storage_percentage < 1
      ? t("common.storage_under_one_percent")
      : `${format_decimal(storage_percentage, 0)}%`;

  return (
    <div className="px-2.5 pb-3 pt-1">
      <button
        aria-label={t("settings.storage")}
        className="block w-full text-start rounded-md"
        type="button"
        onClick={on_open}
      >
        <span className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="text-[13px] font-medium text-txt-secondary truncate">
            {t("common.storage_used")}
          </span>
          <span
            className="text-[13px] font-medium tabular-nums flex-shrink-0"
            style={{
              color: is_critical
                ? "var(--color-danger)"
                : "var(--text-tertiary)",
            }}
          >
            {percent_text}
          </span>
        </span>
        <span
          aria-label={t("common.storage_used")}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(storage_percentage)}
          className="block h-1.5 w-full rounded-full overflow-hidden"
          role="progressbar"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--text-muted) 26%, transparent)",
          }}
        >
          <span
            className="block h-full rounded-full"
            style={{
              minWidth: "6px",
              width: `${Math.min(100, Math.max(0, storage_percentage))}%`,
              backgroundColor: is_critical
                ? "var(--color-danger)"
                : "var(--accent-color)",
            }}
          />
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-xs text-txt-muted truncate tabular-nums">
          {format_bytes(storage_used_bytes)} {t("common.of")}{" "}
          {format_bytes(storage_total_bytes)}
        </p>
        <button
          className="text-xs font-medium flex-shrink-0 text-txt-secondary hover:text-brand"
          type="button"
          onClick={on_buy_more}
        >
          {t("common.buy_more_storage")}
        </button>
      </div>
    </div>
  );
});

export const SidebarAccountSwitcher = memo(function SidebarAccountSwitcher({
  is_collapsed,
  storage_percentage,
  storage_used_bytes,
  storage_total_bytes,
  on_settings_click,
  on_modal_open,
  on_toggle_collapse,
}: SidebarAccountSwitcherProps) {
  const { t } = use_i18n();
  const invite_label = t("settings.invite_friends");
  const handle_invite = () => {
    on_modal_open?.();
    on_settings_click("referral");
  };

  if (is_collapsed) {
    return (
      <div className="mt-auto flex-shrink-0 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center gap-0.5">
          <Tooltip tip={invite_label}>
            <button
              aria-label={invite_label}
              className="sidebar-rail-btn"
              type="button"
              onClick={handle_invite}
            >
              <UserGroupIcon className="w-5 h-5" />
            </button>
          </Tooltip>
          {on_toggle_collapse && (
            <Tooltip tip={t("common.expand_sidebar")}>
              <button
                aria-label={t("common.expand_sidebar")}
                className="sidebar-rail-btn"
                type="button"
                onClick={on_toggle_collapse}
              >
                <PanelToggleIcon className="w-5 h-5" direction="expand" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-auto flex-shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <SidebarStorage
        storage_percentage={storage_percentage}
        storage_total_bytes={storage_total_bytes}
        storage_used_bytes={storage_used_bytes}
        on_buy_more={() => {
          on_settings_click("storage");
          scroll_to_storage_addons();
        }}
        on_open={() => on_settings_click("storage")}
      />
      <div className="flex items-center gap-1">
        <button
          className={`${footer_row_class} flex-1 min-w-0 gap-2.5 px-2.5 text-[14px]`}
          type="button"
          onClick={handle_invite}
        >
          <UserGroupIcon className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{invite_label}</span>
        </button>
        {on_toggle_collapse && (
          <Tooltip tip={t("common.collapse_sidebar")}>
            <button
              aria-label={t("common.collapse_sidebar")}
              className={`${footer_row_class} flex-shrink-0 justify-center w-8`}
              type="button"
              onClick={on_toggle_collapse}
            >
              <PanelToggleIcon className="w-5 h-5" direction="collapse" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
});
