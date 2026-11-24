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

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { show_side_panel: true } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/layout/quick_contacts_panel", () => ({
  QuickContactsPanel: ({ is_open }: { is_open: boolean }) => (
    <div data-open={is_open ? "1" : "0"} data-testid="contacts_panel" />
  ),
}));

vi.mock("@/components/layout/quick_security_panel", () => ({
  QuickSecurityPanel: ({ is_open }: { is_open: boolean }) => (
    <div data-open={is_open ? "1" : "0"} data-testid="security_panel" />
  ),
}));

const calendar = vi.hoisted(() => ({
  origin: "https://calendar.astermail.org" as string | null,
  open_externally: vi.fn(),
}));

vi.mock("@/components/layout/quick_calendar_panel", () => ({
  get_calendar_panel_origin: () => calendar.origin,
  open_calendar_externally: calendar.open_externally,
  QuickCalendarPanel: ({ is_open }: { is_open: boolean }) => (
    <div data-open={is_open ? "1" : "0"} data-testid="calendar_panel" />
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

describe("app rail items", () => {
  let container: HTMLDivElement;
  let root: Root;

  const rail_item = (label: string) =>
    container.querySelector<HTMLButtonElement>(
      `.app_rail_column button[aria-label="${label}"]`,
    );

  const panel_state = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`)?.getAttribute("data-open");

  const click = async (label: string) => {
    await act(async () => {
      rail_item(label)?.click();
    });
  };

  beforeEach(async () => {
    calendar.origin = "https://calendar.astermail.org";
    calendar.open_externally.mockReset();
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

  it("lists Calendar, Contacts, and Security Center without a Mail entry", () => {
    const labels = Array.from(
      container.querySelectorAll(".app_rail_column button[aria-expanded]"),
    ).map((button) => button.getAttribute("aria-label"));

    expect(labels).toEqual([
      "common.app_name_calendar",
      "common.contacts",
      "common.security_center",
    ]);
  });

  it("opens the agenda on the first Calendar click and closes it on the second", async () => {
    expect(
      rail_item("common.app_name_calendar")?.getAttribute("aria-expanded"),
    ).toBe("false");

    await click("common.app_name_calendar");

    expect(
      rail_item("common.app_name_calendar")?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(panel_state("calendar_panel")).toBe("1");

    await click("common.app_name_calendar");

    expect(
      rail_item("common.app_name_calendar")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(panel_state("calendar_panel")).toBe("0");
    expect(calendar.open_externally).not.toHaveBeenCalled();
  });

  it("swaps between the agenda, Contacts, and Security Center", async () => {
    await click("common.app_name_calendar");
    await click("common.contacts");

    expect(panel_state("calendar_panel")).toBe("0");
    expect(panel_state("contacts_panel")).toBe("1");

    await click("common.security_center");

    expect(panel_state("contacts_panel")).toBe("0");
    expect(panel_state("security_panel")).toBe("1");

    await click("common.security_center");

    expect(panel_state("security_panel")).toBe("0");
  });

  it("shows the Contacts and Security Center app logos", () => {
    const contacts_logo = rail_item("common.contacts")?.querySelector("img");
    const security_logo = rail_item("common.security_center")?.querySelector(
      "img",
    );

    expect(contacts_logo?.getAttribute("src")).toBe(
      "/icons/contacts/contacts_rail_24.png",
    );
    expect(contacts_logo?.getAttribute("srcset")).toContain(
      "/icons/contacts/contacts_rail_48.png 2x",
    );
    expect(security_logo?.getAttribute("src")).toBe(
      "/icons/security/security_rail_24.png",
    );
    expect(security_logo?.getAttribute("srcset")).toContain(
      "/icons/security/security_rail_72.png 3x",
    );
  });
});
