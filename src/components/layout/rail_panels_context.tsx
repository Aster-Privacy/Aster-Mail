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
import type { ComponentProps, ReactNode } from "react";

import { createContext, useContext, useMemo, useState } from "react";

import { AppRail } from "@/components/layout/app_rail";

interface RailPanelsState {
  is_calendar_open: boolean;
  is_contacts_open: boolean;
  is_security_open: boolean;
  set_calendar_open: (is_open: boolean) => void;
  set_contacts_open: (is_open: boolean) => void;
  set_security_open: (is_open: boolean) => void;
}

const RailPanelsContext = createContext<RailPanelsState | null>(null);

export function RailPanelsProvider({ children }: { children: ReactNode }) {
  const [is_calendar_open, set_calendar_open] = useState(false);
  const [is_contacts_open, set_contacts_open] = useState(false);
  const [is_security_open, set_security_open] = useState(false);

  const value = useMemo(
    () => ({
      is_calendar_open,
      is_contacts_open,
      is_security_open,
      set_calendar_open,
      set_contacts_open,
      set_security_open,
    }),
    [is_calendar_open, is_contacts_open, is_security_open],
  );

  return (
    <RailPanelsContext.Provider value={value}>
      {children}
    </RailPanelsContext.Provider>
  );
}

export function use_rail_panels(): RailPanelsState {
  const value = useContext(RailPanelsContext);

  if (!value) {
    throw new Error("use_rail_panels needs a RailPanelsProvider");
  }

  return value;
}

export function use_any_rail_panel_open(): boolean {
  const { is_calendar_open, is_contacts_open, is_security_open } =
    use_rail_panels();

  return is_calendar_open || is_contacts_open || is_security_open;
}

type ConnectedAppRailProps = Pick<ComponentProps<typeof AppRail>, "on_compose">;

export function ConnectedAppRail({ on_compose }: ConnectedAppRailProps) {
  const {
    is_calendar_open,
    is_contacts_open,
    is_security_open,
    set_calendar_open,
    set_contacts_open,
    set_security_open,
  } = use_rail_panels();

  return (
    <AppRail
      is_calendar_open={is_calendar_open}
      is_contacts_open={is_contacts_open}
      is_security_open={is_security_open}
      on_calendar_open_change={set_calendar_open}
      on_compose={on_compose}
      on_contacts_open_change={set_contacts_open}
      on_security_open_change={set_security_open}
    />
  );
}
