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

import { RailTipLayer } from "@/components/layout/sidebar/rail_tip_layer";

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
      root.render(
        <>
          <StatefulRail />
          <RailTipLayer />
        </>,
      );
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

  it.each([
    ["common.app_name_calendar", "rail"],
    ["common.contacts", "contacts"],
    ["common.security_center", "security"],
  ])("draws %s with the bundled brand artwork", (label, marker) => {
    const button = rail_item(label);
    const icon = button?.querySelector("svg.app_rail_icon");
    const href = icon?.querySelector("image")?.getAttribute("href");

    expect(
      icon?.getAttribute("data-app-rail-icon") ??
        icon?.getAttribute("data-dated-calendar-icon"),
    ).toBe(marker);
    expect(href?.startsWith("data:image/png;base64,")).toBe(true);
    expect(button?.querySelector("img")).toBeNull();
    expect(button?.querySelector("svg[stroke]")).toBeNull();
  });

  it("never swaps the rail to outline icons when artwork reports an error", () => {
    const rail = container.querySelector(".app_rail_column");
    const before = rail?.innerHTML;

    act(() => {
      rail
        ?.querySelectorAll("image")
        .forEach((image) => image.dispatchEvent(new Event("error")));
    });

    expect(rail?.innerHTML).toBe(before);
    expect(rail?.querySelectorAll("svg.app_rail_icon image")).toHaveLength(3);
    expect(rail?.innerHTML).not.toContain("M6.75 3v2.25M17.25 3v2.25");
    expect(rail?.innerHTML).not.toContain(
      "M15 19.128a9.38 9.38 0 0 0 2.625.372",
    );
  });

  describe("tooltips", () => {
    const tip = () => document.getElementById("aster_rail_tip");

    const hover = async (label: string) => {
      await act(async () => {
        rail_item(label)?.dispatchEvent(
          new PointerEvent("pointerover", { bubbles: true }),
        );
        vi.advanceTimersByTime(450);
      });
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows each item's own label to the left of the rail", async () => {
      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          ".app_rail_column button[aria-expanded]",
        ),
      );

      expect(buttons).toHaveLength(3);
      for (const button of buttons) {
        const label = button.getAttribute("aria-label") ?? "";

        expect(button.getAttribute("data-rail-tip")).toBe(label);
        await hover(label);
        expect(tip()?.textContent).toBe(label);
        expect(tip()?.getAttribute("data-tip-arrow")).toBe("left");
        expect(button.getAttribute("aria-describedby")).toBe("aster_rail_tip");
      }
    });

    it("follows the pointer between items in both directions", async () => {
      const path = [
        "common.security_center",
        "common.contacts",
        "common.app_name_calendar",
        "common.contacts",
        "common.security_center",
      ];

      for (const label of path) {
        await hover(label);
        expect(tip()?.textContent).toBe(label);
        expect(
          container.querySelectorAll('[aria-describedby="aster_rail_tip"]'),
        ).toHaveLength(1);
      }
    });

    it("drops the tip of an item once its panel is open", async () => {
      await hover("common.contacts");
      expect(tip()?.textContent).toBe("common.contacts");

      await click("common.contacts");
      await act(async () => {
        await Promise.resolve();
      });

      expect(tip()).toBeNull();
      expect(rail_item("common.contacts")?.hasAttribute("data-rail-tip")).toBe(
        false,
      );

      await hover("common.security_center");
      expect(tip()?.textContent).toBe("common.security_center");
    });
  });
});
