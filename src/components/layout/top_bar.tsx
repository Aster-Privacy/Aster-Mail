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
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bars3Icon,
  Cog6ToothIcon,
  LifebuoyIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { SearchBar } from "@/components/search/search_bar";
import { WorkspaceSwitcher } from "@/components/layout/workspace_switcher";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { use_preferences } from "@/contexts/preferences_context";
import { use_primary_identity } from "@/lib/primary_identity";


const HELP_CENTER_URL = "https://astermail.org/help";

interface TopBarProps {
  is_settings_view?: boolean;
  on_mobile_menu_toggle: () => void;
  on_search_result_click?: (id: string) => void;
  on_search_submit?: (query: string) => void;
  on_settings_click: () => void;
  on_shortcuts_click: () => void;
  search_context?: string;
}

function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect height="12" rx="2" strokeLinejoin="round" width="20" x="2" y="6" />
      <path
        d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconButton({
  children,
  label,
  on_click,
}: {
  children: React.ReactNode;
  label: string;
  on_click: () => void;
}) {
  return (
    <Tooltip tip={label}>
      <button
        aria-label={label}
        className="flex items-center justify-center w-9 h-9 rounded-full transition-colors text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus:outline-none"
        type="button"
        onClick={on_click}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function TopBar({
  is_settings_view = false,
  on_mobile_menu_toggle,
  on_search_result_click,
  on_search_submit,
  on_settings_click,
  on_shortcuts_click,
  search_context,
}: TopBarProps) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { preferences, update_preference } = use_preferences();
  const { limits } = use_plan_limits();
  const is_free_plan = limits?.plan_code === "free";
  const navigate = useNavigate();
  const [is_accounts_open, set_is_accounts_open] = useState(false);
  const [is_mobile, set_is_mobile] = useState(false);
  const [show_account_tip, set_show_account_tip] = useState(false);
  const account_tip_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open_account_tip = useCallback(() => {
    if (account_tip_timer.current) clearTimeout(account_tip_timer.current);
    account_tip_timer.current = setTimeout(
      () => set_show_account_tip(true),
      500,
    );
  }, []);

  const close_account_tip = useCallback(() => {
    if (account_tip_timer.current) clearTimeout(account_tip_timer.current);
    set_show_account_tip(false);
  }, []);

  useEffect(() => {
    return () => {
      if (account_tip_timer.current) clearTimeout(account_tip_timer.current);
    };
  }, []);

  useEffect(() => {
    const check_breakpoint = () => set_is_mobile(window.innerWidth < 768);

    check_breakpoint();
    window.addEventListener("resize", check_breakpoint);

    return () => window.removeEventListener("resize", check_breakpoint);
  }, []);

  const account_email = user?.email ?? "";
  const primary_identity = use_primary_identity(account_email);
  const display_name =
    user?.display_name ||
    user?.username ||
    (primary_identity.email || account_email).split("@")[0];

  const open_billing = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "billing" }),
    );
  }, []);

  const sidebar_expanded_width = Math.min(
    360,
    Math.max(200, preferences.sidebar_width ?? 256),
  );
  const left_cluster_width = preferences.sidebar_minimized
    ? 64
    : sidebar_expanded_width;

  const handle_menu_click = useCallback(() => {
    if (is_mobile) {
      on_mobile_menu_toggle();

      return;
    }
    update_preference(
      "sidebar_minimized",
      !(preferences.sidebar_minimized ?? false),
      true,
    );
  }, [
    is_mobile,
    on_mobile_menu_toggle,
    preferences.sidebar_minimized,
    update_preference,
  ]);

  return (
    <header
      className="flex items-center h-14 pr-2 sm:pr-3 flex-shrink-0"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <div
        className="flex items-center gap-2 flex-shrink-0 px-2 sm:px-3"
        style={is_mobile ? undefined : { width: left_cluster_width }}
      >
        {is_mobile && (
          <IconButton label={t("common.open_menu")} on_click={handle_menu_click}>
            <Bars3Icon className="w-5 h-5" />
          </IconButton>
        )}
        <Tooltip delay={1200} tip={t("common.aster_mail")}>
          <button
            aria-label={t("common.aster_mail")}
            className="hidden sm:flex items-center select-none overflow-hidden px-2 py-2 -mx-2 outline-none focus:outline-none"
            type="button"
            onClick={() => {
              navigate("/");
              window.dispatchEvent(new CustomEvent("astermail:inbox-home"));
            }}
          >
          {preferences.sidebar_minimized ? (
            <img
              alt={t("common.aster_mail")}
              className="h-7 w-7 flex-shrink-0 object-contain"
              decoding="async"
              draggable={false}
              src="/mail_logo.webp"
            />
          ) : (
            <>
              <img
                alt={t("common.aster_mail")}
                className="h-6 w-auto max-w-full object-contain object-left dark:hidden"
                decoding="async"
                draggable={false}
                src="/aster_mail_logo_light.png"
              />
              <img
                alt={t("common.aster_mail")}
                className="h-6 w-auto max-w-full object-contain object-left hidden dark:block"
                decoding="async"
                draggable={false}
                src="/aster_mail_logo_dark.png"
              />
            </>
          )}
          </button>
        </Tooltip>
      </div>

      <div className="flex-1 min-w-0 flex items-center pl-1 md:pl-2">
        {is_settings_view ? (
          <div className="w-full" id="settings_search_slot" />
        ) : (
          <SearchBar
            is_pill
            on_result_click={on_search_result_click}
            on_search_submit={on_search_submit}
            search_context={search_context}
          />
        )}
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 ml-auto pl-2">
        <DropdownMenu>
          <Tooltip tip={t("common.help")}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t("settings.category_support")}
                className="flex items-center justify-center w-9 h-9 rounded-full transition-colors text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus:outline-none"
                type="button"
              >
                <QuestionMarkCircleIcon className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={() =>
                window.open(HELP_CENTER_URL, "_blank", "noopener,noreferrer")
              }
            >
              <LifebuoyIcon className="w-4 h-4 mr-2" />
              {t("settings.bridge_support_help")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={on_shortcuts_click}>
              <KeyboardIcon className="w-4 h-4 mr-2" />
              {t("common.keyboard_shortcuts")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <IconButton label={t("settings.title")} on_click={on_settings_click}>
          <Cog6ToothIcon className="w-5 h-5" />
        </IconButton>

        {is_free_plan && (
          <Tooltip tip={t("common.upgrade_tooltip")}>
            <Button
              className="hidden sm:inline-flex !h-9 !rounded-full !text-[14px] !font-medium !px-5 ml-1"
              size="sm"
              variant="depth"
              onClick={open_billing}
            >
              {t("common.upgrade")}
            </Button>
          </Tooltip>
        )}

        <div
          className="relative"
          onMouseEnter={open_account_tip}
          onMouseLeave={close_account_tip}
          onPointerDownCapture={close_account_tip}
        >
          <WorkspaceSwitcher
            align="end"
            is_open={is_accounts_open}
            on_open_change={set_is_accounts_open}
            trigger={
              <button
                aria-label={t("auth.your_accounts")}
                className={`flex flex-shrink-0 items-center justify-center w-9 h-9 rounded-full p-0 leading-none transition-colors hover:bg-[var(--bg-hover)] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                  is_free_plan
                    ? ""
                    : "ring-2 ring-inset ring-[var(--plan-ring)]"
                }`}
                type="button"
                onClick={close_account_tip}
              >
                <ProfileAvatar
                  className="block"
                  email={account_email}
                  image_url={user?.profile_picture}
                  name={display_name}
                  profile_color={preferences.profile_color}
                  size="sm"
                />
              </button>
            }
          />
          {show_account_tip && !is_accounts_open && (
            <div className="aster_tip_portal pointer-events-none absolute right-0 top-full mt-1.5 z-[70] text-left">
              <p className="font-medium text-[var(--text-primary)]">
                {t("common.aster_account")}
              </p>
              <p>{display_name}</p>
              <p className="text-[var(--text-muted)]">
                {primary_identity.email || account_email}
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
