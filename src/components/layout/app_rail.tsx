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
import { memo, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ChevronDoubleLeftIcon,
  ChevronRightIcon,

  UsersIcon,
} from "@heroicons/react/24/outline";

import { AsterSecurityMark } from "@/components/icons/aster_security_mark";
import { QuickContactsPanel } from "@/components/layout/quick_contacts_panel";
import { QuickSecurityPanel } from "@/components/layout/quick_security_panel";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";

const RAIL_HIDDEN_KEY = "aster_app_rail_hidden";

function read_hidden() {
  try {
    return localStorage.getItem(RAIL_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

interface AppRailProps {
  is_contacts_open: boolean;
  is_security_open: boolean;
  on_contacts_open_change: (is_open: boolean) => void;
  on_security_open_change: (is_open: boolean) => void;
  on_compose: (address: string) => void;
}

function AppRailComponent({
  is_contacts_open,
  is_security_open,
  on_contacts_open_change,
  on_security_open_change,
  on_compose,
}: AppRailProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const location = useLocation();
  const is_settings_view = location.pathname.startsWith("/settings");
  const [is_hidden, set_is_hidden] = useState(read_hidden);
  const [has_icon, set_has_icon] = useState(true);
  const [has_security_icon, set_has_security_icon] = useState(true);

  const handle_icon_error = useCallback(() => {
    set_has_icon(false);
  }, []);

  const handle_security_icon_error = useCallback(() => {
    set_has_security_icon(false);
  }, []);

  const close_contacts = useCallback(() => {
    on_contacts_open_change(false);
  }, [on_contacts_open_change]);

  const close_security = useCallback(() => {
    on_security_open_change(false);
  }, [on_security_open_change]);

  const toggle_contacts = useCallback(() => {
    const next = !is_contacts_open;

    on_contacts_open_change(next);
    if (next) on_security_open_change(false);
  }, [is_contacts_open, on_contacts_open_change, on_security_open_change]);

  const toggle_security = useCallback(() => {
    const next = !is_security_open;

    on_security_open_change(next);
    if (next) on_contacts_open_change(false);
  }, [is_security_open, on_contacts_open_change, on_security_open_change]);

  const toggle_hidden = useCallback(() => {
    set_is_hidden((hidden) => !hidden);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_HIDDEN_KEY, is_hidden ? "1" : "0");
    } catch {
      return;
    }
  }, [is_hidden]);

  useEffect(() => {
    if (!is_hidden) return;
    on_contacts_open_change(false);
    on_security_open_change(false);
  }, [is_hidden, on_contacts_open_change, on_security_open_change]);

  if (!preferences.show_side_panel) return null;

  return (
    <>
      <QuickContactsPanel
        is_open={is_contacts_open}
        is_top_inset={is_settings_view}
        on_close={close_contacts}
        on_compose={on_compose}
      />
      <QuickSecurityPanel
        is_open={is_security_open}
        is_top_inset={is_settings_view}
        on_close={close_security}
      />
      {is_hidden && (
        <button
          aria-label={t("common.expand_sidebar")}
          className="app_rail_popout absolute bottom-3 end-0 z-20 hidden h-9 w-6 items-center justify-center rounded-s-lg md:flex"
          data-rail-tip={t("common.expand_sidebar")}
          data-rail-tip-side="left"
          type="button"
          onClick={toggle_hidden}
        >
          <ChevronDoubleLeftIcon className="h-4 w-4" />
        </button>
      )}
      <div
        aria-hidden={is_hidden}
        className={`app_rail_column hidden shrink-0 flex-col items-center overflow-hidden pb-2 pt-2.5 md:flex ${
          is_hidden ? "pointer-events-none w-0 opacity-0" : "w-[52px] md:-ms-2"
        }`}
      >
        <button
          aria-expanded={is_contacts_open}
          aria-label={t("common.contacts")}
          className="app_rail_btn flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          data-rail-tip={is_contacts_open ? undefined : t("common.contacts")}
          data-rail-tip-side="left"
          data-selected={is_contacts_open ? "true" : undefined}
          tabIndex={is_hidden ? -1 : undefined}
          type="button"
          onClick={toggle_contacts}
        >
          {has_icon ? (
            <img
              alt=""
              aria-hidden="true"
              className="h-6 w-6 shrink-0 select-none"
              decoding="sync"
              draggable={false}
              height={24}
              loading="eager"
              src="/icons/contacts/contacts_24.png"
              srcSet="/icons/contacts/contacts_24.png 1x, /icons/contacts/contacts_48.png 2x, /icons/contacts/contacts_72.png 3x"
              width={24}
              onError={handle_icon_error}
            />
          ) : (
            <UsersIcon className="h-5 w-5 shrink-0" />
          )}
        </button>
        <button
          aria-expanded={is_security_open}
          aria-label={t("common.security_center")}
          className="app_rail_btn mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          data-rail-tip={
            is_security_open ? undefined : t("common.security_center")
          }
          data-rail-tip-side="left"
          data-selected={is_security_open ? "true" : undefined}
          tabIndex={is_hidden ? -1 : undefined}
          type="button"
          onClick={toggle_security}
        >
          {has_security_icon ? (
            <img
              alt=""
              aria-hidden="true"
              className="h-6 w-6 shrink-0 select-none"
              decoding="sync"
              draggable={false}
              height={24}
              loading="eager"
              src="/icons/security/security_24.png"
              srcSet="/icons/security/security_24.png 1x, /icons/security/security_48.png 2x, /icons/security/security_72.png 3x"
              width={24}
              onError={handle_security_icon_error}
            />
          ) : (
            <AsterSecurityMark className="h-5 w-5 shrink-0" />
          )}
        </button>
        <button
          aria-label={t("common.collapse_sidebar")}
          className="app_rail_toggle mt-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          data-rail-tip={t("common.collapse_sidebar")}
          data-rail-tip-side="left"
          tabIndex={is_hidden ? -1 : undefined}
          type="button"
          onClick={toggle_hidden}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

export const AppRail = memo(AppRailComponent);
