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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { AppRail } from "./app_rail";

import {
  DEFAULT_PREFERENCES,
  build_merged_preferences,
} from "@/services/api/preferences";

let show_side_panel = true;

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { show_side_panel } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/layout/quick_contacts_panel", () => ({
  QuickContactsPanel: () => null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("side panel setting", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_rail = async (
    initial_path: string,
    on_contacts_open_change: (is_open: boolean) => void = () => {},
  ) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initial_path]}>
          <AppRail
            is_contacts_open={false}
            on_compose={() => {}}
            on_contacts_open_change={on_contacts_open_change}
          />
        </MemoryRouter>,
      );
    });
  };

  beforeEach(() => {
    show_side_panel = true;
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the rail when the side panel setting is on", async () => {
    await render_rail("/");

    expect(container.querySelector(".app_rail_column")).not.toBeNull();
  });

  it("renders nothing when the side panel setting is off", async () => {
    show_side_panel = false;
    await render_rail("/");

    expect(container.querySelector(".app_rail_column")).toBeNull();
    expect(container.querySelector(".app_rail_popout")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("stays hidden on the settings route when the setting is off", async () => {
    show_side_panel = false;
    await render_rail("/settings/behavior");

    expect(container.querySelector(".app_rail_column")).toBeNull();
  });

  it("keeps the rail collapsed but present when the device collapsed it", async () => {
    localStorage.setItem("aster_app_rail_hidden", "1");
    await render_rail("/");

    expect(container.querySelector(".app_rail_popout")).not.toBeNull();
  });

  it("opens the contacts panel on load when nothing is stored", async () => {
    const on_change = vi.fn();

    await render_rail("/", on_change);

    expect(on_change).toHaveBeenCalledWith(true);
  });

  it("leaves the contacts panel closed when the device closed it", async () => {
    localStorage.setItem("aster_rail_contacts_open", "0");

    const on_change = vi.fn();

    await render_rail("/", on_change);

    expect(on_change).not.toHaveBeenCalledWith(true);
  });

  it("leaves the contacts panel closed while the rail is collapsed", async () => {
    localStorage.setItem("aster_app_rail_hidden", "1");

    const on_change = vi.fn();

    await render_rail("/", on_change);

    expect(on_change).not.toHaveBeenCalledWith(true);
  });

  it("defaults the side panel to visible", () => {
    expect(DEFAULT_PREFERENCES.show_side_panel).toBe(true);
  });

  it("adopts the side panel setting saved on another device", () => {
    const merged = build_merged_preferences(
      { show_side_panel: false },
      { ...DEFAULT_PREFERENCES },
    );

    expect(merged.show_side_panel).toBe(false);
  });

  it("keeps a locally cached side panel setting when the server blob omits it", () => {
    const merged = build_merged_preferences(
      {},
      { ...DEFAULT_PREFERENCES, show_side_panel: false },
    );

    expect(merged.show_side_panel).toBe(false);
  });
});
