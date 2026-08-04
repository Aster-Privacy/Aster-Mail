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
import { Tooltip } from "@aster/ui";

import { Skeleton } from "@/components/ui/skeleton";
import { format_bytes } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

function PanelToggleIcon({
  direction,
  className,
}: {
  direction: "collapse" | "expand";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="16"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        width="18"
        x="3"
        y="4"
      />
      <path d="M9.5 4.8V19.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d={direction === "collapse" ? "M17 9.5 14 12l3 2.5" : "M14 9.5l3 2.5-3 2.5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

interface SidebarAccountSwitcherProps {
  is_collapsed: boolean;
  storage_percentage: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
  on_settings_click: (section?: SettingsSection) => void;
  on_modal_open?: () => void;
  on_toggle_collapse?: () => void;
}

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
  return (
    <div className="mt-auto flex-shrink-0">
      <div
        className={`${is_collapsed ? "px-2" : "px-3"} pb-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
      >
        {!is_collapsed && (
          <>
            {storage_total_bytes > 0 ? (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium tracking-wide text-txt-muted">
                  {t("common.storage_used")}
                </span>
                <span
                  className="text-[10px] tabular-nums font-medium"
                  style={{
                    color:
                      storage_percentage >= 90
                        ? "var(--color-danger)"
                        : "var(--text-tertiary)",
                  }}
                >
                  {storage_percentage > 0 && storage_percentage < 1
                    ? "<1%"
                    : `${storage_percentage.toFixed(0)}%`}
                </span>
              </div>
              <div
                className="h-1.5 w-full rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    minWidth: "10px",
                    width: `${storage_percentage}%`,
                    backgroundColor:
                      storage_percentage >= 90
                        ? "var(--color-danger)"
                        : "var(--accent-color)",
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[9px] text-txt-muted">
                  {format_bytes(storage_used_bytes)} {t("common.of")}{" "}
                  {format_bytes(storage_total_bytes)}
                </p>
                <button
                  className="text-[9px] text-txt-muted transition-colors hover:text-brand hover:underline focus:outline-none"
                  type="button"
                  onClick={() => {
                    on_settings_click("billing");
                    let attempts = 0;
                    const scroll_to_addons = () => {
                      const el = document.getElementById(
                        "additional_storage_section",
                      );

                      if (el) {
                        el.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });

                        return;
                      }
                      attempts += 1;
                      if (attempts < 20) {
                        setTimeout(scroll_to_addons, 50);
                      }
                    };

                    setTimeout(scroll_to_addons, 60);
                  }}
                >
                  {t("common.buy_more_storage")}
                </button>
              </div>
            </div>
            ) : (
              <div className="mb-3">
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            )}
          </>
        )}

        {is_collapsed ? (
          <div className="flex flex-col items-center gap-0.5">
            <Tooltip tip={t("settings.refer_a_friend")}>
              <button
                aria-label={t("settings.refer_a_friend")}
                className="sidebar-rail-btn"
                type="button"
                onClick={() => {
                  on_modal_open?.();
                  on_settings_click("referral");
                }}
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
        ) : (
          <div className="flex items-center gap-1">
            <button
              className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-[12px] text-[12px] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-txt-muted"
              onClick={() => {
                on_modal_open?.();
                on_settings_click("referral");
              }}
            >
              <UserGroupIcon className="w-3.5 h-3.5" />
              <span>{t("settings.refer_a_friend")}</span>
            </button>
            {on_toggle_collapse && (
              <Tooltip tip={t("common.collapse_sidebar")}>
                <button
                  aria-label={t("common.collapse_sidebar")}
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-[10px] hover:bg-black/[0.06] dark:hover:bg-white/[0.06] text-txt-muted transition-colors"
                  type="button"
                  onClick={on_toggle_collapse}
                >
                  <PanelToggleIcon className="w-[18px] h-[18px]" direction="collapse" />
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
