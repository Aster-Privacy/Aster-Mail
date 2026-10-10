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
import { AppRailView } from "@aster/ui";

import { AppRailIcon } from "@/components/icons/app_rail_icon";
import { QuickContactsPanel } from "@/components/layout/quick_contacts_panel";
import { QuickSecurityPanel } from "@/components/layout/quick_security_panel";
import { use_panel_transition } from "@/components/layout/use_panel_transition";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  read_rail_contacts_open,
  write_rail_contacts_open,
} from "@/lib/rail_contacts_open";
import {
  read_rail_security_open,
  write_rail_security_open,
} from "@/lib/rail_security_open";

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
  const [is_swapping, set_is_swapping] = useState(false);

  const close_contacts = useCallback(() => {
    write_rail_contacts_open(false);
    on_contacts_open_change(false);
  }, [on_contacts_open_change]);

  const close_security = useCallback(() => {
    write_rail_security_open(false);
    on_security_open_change(false);
  }, [on_security_open_change]);

  const toggle_contacts = useCallback(() => {
    const next = !is_contacts_open;

    set_is_swapping(next && is_security_open);
    write_rail_contacts_open(next);
    on_contacts_open_change(next);
    if (next) {
      write_rail_security_open(false);
      on_security_open_change(false);
    }
  }, [
    is_contacts_open,
    is_security_open,
    on_contacts_open_change,
    on_security_open_change,
  ]);

  const toggle_security = useCallback(() => {
    const next = !is_security_open;

    set_is_swapping(next && is_contacts_open);
    write_rail_security_open(next);
    on_security_open_change(next);
    if (next) {
      write_rail_contacts_open(false);
      on_contacts_open_change(false);
    }
  }, [
    is_contacts_open,
    is_security_open,
    on_contacts_open_change,
    on_security_open_change,
  ]);

  useEffect(() => {
    if (!is_swapping) return;

    set_is_swapping(false);
  }, [is_swapping]);

  const { is_visible: is_slot_visible } = use_panel_transition(
    is_contacts_open || is_security_open,
  );

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

  useEffect(() => {
    if (!preferences.show_side_panel) return;
    if (read_hidden()) return;
    if (read_rail_contacts_open()) {
      on_contacts_open_change(true);

      return;
    }
    if (read_rail_security_open()) on_security_open_change(true);
  }, [
    on_contacts_open_change,
    on_security_open_change,
    preferences.show_side_panel,
  ]);

  if (!preferences.show_side_panel) return null;

  return (
    <AppRailView
      is_hidden={is_hidden}
      is_panel_visible={is_slot_visible}
      is_settings_view={is_settings_view}
      items={[
        {
          key: "contacts",
          label: t("common.contacts"),
          selected: is_contacts_open,
          fallback_icon: <AppRailIcon name="contacts" />,
          on_click: toggle_contacts,
        },
        {
          key: "security",
          label: t("common.security_center"),
          selected: is_security_open,
          fallback_icon: <AppRailIcon name="security" />,
          on_click: toggle_security,
        },
      ]}
      labels={{
        expand: t("common.expand_sidebar"),
        collapse: t("common.collapse_sidebar"),
      }}
      panel={
        <>
          <QuickContactsPanel
            is_open={is_contacts_open}
            is_swapping={is_swapping}
            on_close={close_contacts}
            on_compose={on_compose}
          />
          <QuickSecurityPanel
            is_open={is_security_open}
            is_swapping={is_swapping}
            on_close={close_security}
          />
        </>
      }
      on_toggle_hidden={toggle_hidden}
    />
  );
}

export const AppRail = memo(AppRailComponent);
