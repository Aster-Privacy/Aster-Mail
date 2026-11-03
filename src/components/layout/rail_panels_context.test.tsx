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

import {
  ConnectedAppRail,
  RailPanelsProvider,
  use_any_rail_panel_open,
} from "./rail_panels_context";

const mocks = vi.hoisted(() => ({
  rail_props: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/layout/app_rail", () => ({
  AppRail: (props: Record<string, unknown>) => {
    mocks.rail_props.push(props);

    return null;
  },
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const any_open_values: boolean[] = [];

function AnyOpenProbe() {
  any_open_values.push(use_any_rail_panel_open());

  return null;
}

const page_renders = vi.fn();

function PageContent() {
  page_renders();

  return null;
}

const page_content = <PageContent />;

function Page() {
  return (
    <RailPanelsProvider>
      {page_content}
      <AnyOpenProbe />
      <ConnectedAppRail on_compose={() => {}} />
    </RailPanelsProvider>
  );
}

const last_rail = () => mocks.rail_props[mocks.rail_props.length - 1];

describe("rail panels context", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    mocks.rail_props.length = 0;
    any_open_values.length = 0;
    page_renders.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Page />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("starts with every rail panel closed", () => {
    expect(last_rail()).toMatchObject({
      is_calendar_open: false,
      is_contacts_open: false,
      is_security_open: false,
    });
    expect(any_open_values[any_open_values.length - 1]).toBe(false);
  });

  it("opens a panel without rendering the rest of the page again", async () => {
    const open_calendar = last_rail().on_calendar_open_change as (
      is_open: boolean,
    ) => void;

    expect(page_renders).toHaveBeenCalledTimes(1);

    await act(async () => {
      open_calendar(true);
    });

    expect(last_rail()).toMatchObject({ is_calendar_open: true });
    expect(any_open_values[any_open_values.length - 1]).toBe(true);
    expect(page_renders).toHaveBeenCalledTimes(1);

    await act(async () => {
      open_calendar(false);
    });

    expect(last_rail()).toMatchObject({ is_calendar_open: false });
    expect(any_open_values[any_open_values.length - 1]).toBe(false);
    expect(page_renders).toHaveBeenCalledTimes(1);
  });

  it("keeps the change handlers stable", async () => {
    const first = last_rail();

    await act(async () => {
      (first.on_security_open_change as (is_open: boolean) => void)(true);
    });

    const second = last_rail();

    expect(second.is_security_open).toBe(true);
    expect(second.on_security_open_change).toBe(first.on_security_open_change);
    expect(second.on_contacts_open_change).toBe(first.on_contacts_open_change);
    expect(second.on_calendar_open_change).toBe(first.on_calendar_open_change);
  });
});
