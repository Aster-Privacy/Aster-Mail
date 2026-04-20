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
import type { RefObject } from "react";
import type { SettingsSection } from "@/components/settings/settings_panel";

import { memo } from "react";
import {
  UserGroupIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Skeleton } from "@/components/ui/skeleton";
import { format_bytes } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

interface SidebarAccountSwitcherProps {
  is_collapsed: boolean;
  storage_percentage: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
  on_settings_click: (section?: SettingsSection) => void;
  on_modal_open?: () => void;
  text_logo_loaded: boolean;
  set_text_logo_loaded: (loaded: boolean) => void;
  text_logo_ref: RefObject<HTMLImageElement>;
}

export const SidebarAccountSwitcher = memo(function SidebarAccountSwitcher({
  is_collapsed,
  storage_percentage,
  storage_used_bytes,
  storage_total_bytes,
  on_settings_click,
  on_modal_open,
  text_logo_loaded,
  set_text_logo_loaded,
  text_logo_ref,
}: SidebarAccountSwitcherProps) {
  const { t } = use_i18n();

  return (
    <div className="mt-auto flex-shrink-0">
      <div
        className={`${is_collapsed ? "mx-2" : "mx-3"} mb-3 h-px bg-edge-primary`}
      />

      <div
        className={`${is_collapsed ? "px-2" : "px-3"} pb-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
      >
        {!is_collapsed && (
          <>
            <div className="mb-2">
              <div className="relative">
                {!text_logo_loaded && (
                  <Skeleton className="h-[18px] w-[72px] rounded" />
                )}
                <img
                  ref={text_logo_ref}
                  alt="Aster"
                  className={`h-[18px] select-none transition-opacity duration-150 ${text_logo_loaded ? "opacity-100" : "opacity-0"}`}
                  decoding="async"
                  draggable={false}
                  src="/text_logo.png"
                  onLoad={() => {
                    set_text_logo_loaded(true);
                  }}
                />
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium tracking-wide text-txt-muted">
                  {t("common.storage_used")}
                </span>
                <span
                  className="text-[10px] tabular-nums font-medium"
                  style={{
                    color:
                      storage_percentage > 90
                        ? "var(--color-danger)"
                        : storage_percentage > 70
                          ? "var(--color-warning)"
                          : "var(--text-tertiary)",
                  }}
                >
                  {storage_percentage.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden bg-black/[0.05] dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${storage_percentage}%`,
                    backgroundColor:
                      storage_percentage > 90
                        ? "var(--color-danger)"
                        : storage_percentage > 70
                          ? "var(--color-warning)"
                          : "var(--color-info)",
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[9px] text-txt-muted">
                  {format_bytes(storage_used_bytes)} {t("common.of")}{" "}
                  {format_bytes(storage_total_bytes || 1073741824)}
                </p>
                <Button
                  className="text-[10px] font-medium px-2 py-1 hover:-translate-y-[1px]"
                  size="sm"
                  variant="depth"
                  onClick={() => {
                    const scroll_to_addons = () => {
                      const el = document.getElementById(
                        "additional_storage_section",
                      );

                      if (el) {
                        el.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }
                    };
                    const existing = document.getElementById(
                      "additional_storage_section",
                    );

                    if (existing) {
                      scroll_to_addons();
                    } else {
                      on_settings_click("billing");
                      setTimeout(scroll_to_addons, 50);
                    }
                  }}
                >
                  {t("common.buy_more_storage")}
                </Button>
              </div>
            </div>
          </>
        )}

        {is_collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <button
              className="p-2 rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-txt-muted"
              title={t("settings.refer_a_friend")}
              onClick={() => {
                on_modal_open?.();
                on_settings_click("referral");
              }}
            >
              <UserGroupIcon className="w-4 h-4" />
            </button>
            <button
              className="p-2 rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-txt-muted"
              title={t("settings.title")}
              onClick={() => on_settings_click()}
            >
              <Cog6ToothIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-txt-muted"
              onClick={() => {
                on_modal_open?.();
                on_settings_click("referral");
              }}
            >
              <UserGroupIcon className="w-3.5 h-3.5" />
              <span>{t("settings.refer_a_friend")}</span>
            </button>
            <button
              className="p-1.5 rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-txt-muted"
              onClick={() => on_settings_click()}
            >
              <Cog6ToothIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
