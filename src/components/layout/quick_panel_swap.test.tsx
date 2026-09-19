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
import { readFileSync } from "node:fs";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { AppRail } from "./app_rail";
import {
  use_panel_transition,
  PANEL_TRANSITION_MS,
} from "./use_panel_transition";

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { show_side_panel: true } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

const contacts_renders: boolean[] = [];
const security_renders: boolean[] = [];

vi.mock("@/components/layout/quick_contacts_panel", () => ({
  QuickContactsPanel: ({
    is_open,
    is_swapping,
  }: {
    is_open: boolean;
    is_swapping: boolean;
  }) => {
    contacts_renders.push(is_swapping);

    return <div data-open={is_open ? "1" : "0"} data-testid="contacts_panel" />;
  },
}));

vi.mock("@/components/layout/quick_security_panel", () => ({
  QuickSecurityPanel: ({
    is_open,
    is_swapping,
  }: {
    is_open: boolean;
    is_swapping: boolean;
  }) => {
    security_renders.push(is_swapping);

    return <div data-open={is_open ? "1" : "0"} data-testid="security_panel" />;
  },
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function RailHarness() {
  const [is_contacts_open, set_is_contacts_open] = useState(false);
  const [is_security_open, set_is_security_open] = useState(false);
  const on_contacts_open_change = useCallback(
    (next: boolean) => set_is_contacts_open(next),
    [],
  );
  const on_security_open_change = useCallback(
    (next: boolean) => set_is_security_open(next),
    [],
  );

  return (
    <MemoryRouter initialEntries={["/"]}>
      <AppRail
        is_contacts_open={is_contacts_open}
        is_security_open={is_security_open}
        on_compose={() => {}}
        on_contacts_open_change={on_contacts_open_change}
        on_security_open_change={on_security_open_change}
      />
    </MemoryRouter>
  );
}

function PanelProbe({
  is_open,
  is_swapping,
}: {
  is_open: boolean;
  is_swapping: boolean;
}) {
  const { is_visible } = use_panel_transition(is_open, is_swapping);

  return <div data-testid="probe" data-visible={is_visible ? "1" : "0"} />;
}

describe("quick panel swap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    contacts_renders.length = 0;
    security_renders.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  const click = async (label: string) => {
    const button = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );

    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
  };

  const open_state = (id: string) =>
    container
      .querySelector(`[data-testid="${id}"]`)
      ?.getAttribute("data-open") ?? null;

  it("gives both quick panels a single shared layout slot", async () => {
    await act(async () => {
      root.render(<RailHarness />);
    });

    expect(container.querySelectorAll(".quick_panel_slot")).toHaveLength(1);

    const slot = container.querySelector(".quick_panel_slot");

    expect(slot?.className).toContain("w-0");
    expect(slot?.querySelector('[data-testid="contacts_panel"]')).not.toBeNull();
    expect(slot?.querySelector('[data-testid="security_panel"]')).not.toBeNull();
  });

  it("keeps exactly one slot width while the panels swap", async () => {
    await act(async () => {
      root.render(<RailHarness />);
    });

    await click("common.contacts");

    const open_class = container.querySelector(".quick_panel_slot")?.className;

    expect(open_class).not.toContain("w-0");

    await click("common.security_center");

    expect(container.querySelectorAll(".quick_panel_slot")).toHaveLength(1);
    expect(container.querySelector(".quick_panel_slot")?.className).toBe(
      open_class,
    );
  });

  it("never lets a quick panel size the row itself", () => {
    for (const file of [
      "src/components/layout/quick_contacts_panel.tsx",
      "src/components/layout/quick_security_panel.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      const root_class = source
        .split(/\r?\n/)
        .find((line) => line.includes("className={`quick_"));

      expect(root_class).toBeDefined();
      expect(root_class).toContain("absolute inset-0");
      expect(root_class).not.toContain("flex-shrink-0");
      expect(root_class).not.toContain("w-[");
    }
  });

  it("marks the rail as swapping when one panel replaces the other", async () => {
    await act(async () => {
      root.render(<RailHarness />);
    });

    await click("common.contacts");
    expect(open_state("contacts_panel")).toBe("1");

    contacts_renders.length = 0;
    await click("common.security_center");

    expect(open_state("contacts_panel")).toBe("0");
    expect(open_state("security_panel")).toBe("1");
    expect(contacts_renders[0]).toBe(true);
  });

  it("clears the swap flag once the swap render is committed", async () => {
    await act(async () => {
      root.render(<RailHarness />);
    });

    await click("common.contacts");
    await click("common.security_center");

    expect(contacts_renders.at(-1)).toBe(false);
    expect(security_renders.at(-1)).toBe(false);
  });

  it("does not mark a plain open as a swap", async () => {
    await act(async () => {
      root.render(<RailHarness />);
    });

    await click("common.contacts");

    expect(contacts_renders.every((flag) => flag === false)).toBe(true);
  });

  it("keeps a closing panel mounted for the exit animation", async () => {
    vi.useFakeTimers();
    await act(async () => {
      root.render(<PanelProbe is_open is_swapping={false} />);
    });
    await act(async () => {
      root.render(<PanelProbe is_open={false} is_swapping={false} />);
    });

    expect(
      container
        .querySelector('[data-testid="probe"]')
        ?.getAttribute("data-visible"),
    ).toBe("1");

    await act(async () => {
      vi.advanceTimersByTime(PANEL_TRANSITION_MS);
    });

    expect(
      container
        .querySelector('[data-testid="probe"]')
        ?.getAttribute("data-visible"),
    ).toBe("0");
  });

  it("drops a closing panel immediately when the other panel is taking its place", async () => {
    await act(async () => {
      root.render(<PanelProbe is_open is_swapping={false} />);
    });
    await act(async () => {
      root.render(<PanelProbe is_swapping is_open={false} />);
    });

    expect(
      container
        .querySelector('[data-testid="probe"]')
        ?.getAttribute("data-visible"),
    ).toBe("0");
  });
});
