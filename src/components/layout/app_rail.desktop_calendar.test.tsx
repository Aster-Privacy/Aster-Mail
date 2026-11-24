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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { AppRail } from "./app_rail";

const desktop = vi.hoisted(() => ({
  open_external: vi.fn(),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => true,
}));

vi.mock("@/utils/open_link", () => ({
  open_external: desktop.open_external,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { show_side_panel: true } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/layout/quick_contacts_panel", () => ({
  QuickContactsPanel: () => null,
}));

vi.mock("@/components/layout/quick_security_panel", () => ({
  QuickSecurityPanel: () => null,
}));

vi.mock("@/components/layout/desktop_calendar_panel", () => ({
  DesktopCalendarPanel: ({ is_open }: { is_open: boolean }) => (
    <div data-open={is_open ? "1" : "0"} data-testid="desktop_calendar" />
  ),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function StatefulRail() {
  const [is_calendar_open, set_calendar_open] = useState(false);
  const [is_contacts_open, set_contacts_open] = useState(false);
  const [is_security_open, set_security_open] = useState(false);

  return (
    <MemoryRouter initialEntries={["/"]}>
      <AppRail
        is_calendar_open={is_calendar_open}
        is_contacts_open={is_contacts_open}
        is_security_open={is_security_open}
        on_calendar_open_change={set_calendar_open}
        on_compose={() => {}}
        on_contacts_open_change={set_contacts_open}
        on_security_open_change={set_security_open}
      />
    </MemoryRouter>
  );
}

describe("app rail calendar on desktop", () => {
  let container: HTMLDivElement;
  let root: Root;

  const calendar_item = () =>
    container.querySelector<HTMLButtonElement>(
      '.app_rail_column button[aria-label="common.app_name_calendar"]',
    );

  const click_calendar = async () => {
    await act(async () => {
      calendar_item()?.click();
    });
  };

  beforeEach(async () => {
    desktop.open_external.mockReset();
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<StatefulRail />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the agenda inside the app instead of the browser", async () => {
    await click_calendar();

    expect(desktop.open_external).not.toHaveBeenCalled();
    expect(calendar_item()?.getAttribute("aria-expanded")).toBe("true");
    expect(
      container
        .querySelector('[data-testid="desktop_calendar"]')
        ?.getAttribute("data-open"),
    ).toBe("1");
  });

  it("closes the agenda on a second click", async () => {
    await click_calendar();
    await click_calendar();

    expect(calendar_item()?.getAttribute("aria-expanded")).toBe("false");
    expect(
      container
        .querySelector('[data-testid="desktop_calendar"]')
        ?.getAttribute("data-open"),
    ).toBe("0");
    expect(desktop.open_external).not.toHaveBeenCalled();
  });
});
