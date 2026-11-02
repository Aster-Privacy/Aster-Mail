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
  QuickCalendarPanel,
  read_panel_message,
  resolve_calendar_panel_origin,
} from "./quick_calendar_panel";

const mocks = vi.hoisted(() => ({
  theme: "light" as "light" | "dark",
  open_external: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/use_panel_inset", () => ({
  use_panel_inset: () => {},
}));

vi.mock("@/lib/overlay_layer_stack", () => ({
  use_escape_layer: () => {},
}));

vi.mock("@/components/layout/use_panel_transition", () => ({
  use_panel_transition: (is_open: boolean) => ({
    is_visible: is_open,
    is_closing: false,
  }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: mocks.theme }),
}));

vi.mock("@/utils/open_link", () => ({
  open_external: mocks.open_external,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ORIGIN = "https://calendar.astermail.org";

describe("resolve_calendar_panel_origin", () => {
  const base = {
    is_desktop: false,
    is_dev: false,
    dev_origin: undefined,
    location_origin: "https://app.astermail.org",
  };

  it("uses the Calendar origin only on the Mail web origin", () => {
    expect(resolve_calendar_panel_origin(base)).toBe(ORIGIN);
    expect(
      resolve_calendar_panel_origin({
        ...base,
        location_origin: "https://evil.example",
      }),
    ).toBeNull();
    expect(
      resolve_calendar_panel_origin({
        ...base,
        location_origin: "http://app.astermail.org",
      }),
    ).toBeNull();
  });

  it("never embeds the panel in the desktop app", () => {
    expect(resolve_calendar_panel_origin({ ...base, is_desktop: true })).toBe(
      null,
    );
  });

  it("ignores the dev origin outside development", () => {
    expect(
      resolve_calendar_panel_origin({
        ...base,
        location_origin: "http://localhost:5173",
        dev_origin: "http://localhost:5180",
      }),
    ).toBeNull();
  });

  it("reads a valid dev origin in development", () => {
    const dev = { ...base, is_dev: true };

    expect(
      resolve_calendar_panel_origin({
        ...dev,
        dev_origin: "http://localhost:5180/",
      }),
    ).toBe("http://localhost:5180");
    expect(resolve_calendar_panel_origin(dev)).toBeNull();
    expect(
      resolve_calendar_panel_origin({ ...dev, dev_origin: "javascript:1" }),
    ).toBeNull();
    expect(
      resolve_calendar_panel_origin({ ...dev, dev_origin: "not a url" }),
    ).toBeNull();
  });
});

describe("read_panel_message", () => {
  const frame = {} as Window;
  const data = { source: "aster-calendar-panel", type: "ready" };

  it("accepts known messages from the panel frame at the Calendar origin", () => {
    expect(
      read_panel_message(
        { origin: ORIGIN, source: frame, data },
        frame,
        ORIGIN,
      ),
    ).toBe("ready");
    expect(
      read_panel_message(
        { origin: ORIGIN, source: frame, data: { ...data, type: "close" } },
        frame,
        ORIGIN,
      ),
    ).toBe("close");
  });

  it("rejects messages from another window, origin, or shape", () => {
    expect(
      read_panel_message(
        { origin: ORIGIN, source: {} as Window, data },
        frame,
        ORIGIN,
      ),
    ).toBeNull();
    expect(
      read_panel_message(
        { origin: "https://calendar.astermail.org.evil", source: frame, data },
        frame,
        ORIGIN,
      ),
    ).toBeNull();
    expect(
      read_panel_message({ origin: ORIGIN, source: frame, data }, null, ORIGIN),
    ).toBeNull();
    expect(
      read_panel_message(
        { origin: ORIGIN, source: frame, data: { ...data, source: "x" } },
        frame,
        ORIGIN,
      ),
    ).toBeNull();
    expect(
      read_panel_message(
        { origin: ORIGIN, source: frame, data: { ...data, type: "navigate" } },
        frame,
        ORIGIN,
      ),
    ).toBeNull();
    expect(
      read_panel_message(
        { origin: ORIGIN, source: frame, data: "ready" },
        frame,
        ORIGIN,
      ),
    ).toBeNull();
    expect(
      read_panel_message(
        { origin: ORIGIN, source: frame, data: [data] },
        frame,
        ORIGIN,
      ),
    ).toBeNull();
  });
});

describe("quick calendar panel", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_panel = async (
    is_open: boolean,
    on_close: () => void = () => {},
  ) => {
    await act(async () => {
      root.render(
        <QuickCalendarPanel
          is_open={is_open}
          is_swapping={false}
          on_close={on_close}
          origin={ORIGIN}
        />,
      );
    });
  };

  const frame = () => container.querySelector("iframe");

  const send = async (data: unknown, origin = ORIGIN) => {
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          source: frame()?.contentWindow ?? null,
          data,
        }),
      );
    });
  };

  beforeEach(() => {
    mocks.theme = "light";
    mocks.open_external.mockReset();
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

  it("does not load the frame until the panel first opens", async () => {
    await render_panel(false);

    expect(frame()).toBeNull();

    await render_panel(true);

    expect(frame()?.getAttribute("src")).toBe(
      `${ORIGIN}/mail-panel?theme=light`,
    );
    expect(frame()?.getAttribute("sandbox")).toContain("allow-scripts");
    expect(frame()?.getAttribute("sandbox")).not.toContain(
      "allow-top-navigation",
    );
  });

  it("keeps the frame mounted after the panel closes", async () => {
    await render_panel(true);
    await render_panel(false);

    expect(frame()).not.toBeNull();
  });

  it("reveals the frame only after the panel says it is ready", async () => {
    await render_panel(true);

    expect(frame()?.className).toContain("opacity-0");

    await send(
      { source: "aster-calendar-panel", type: "ready" },
      "https://x.example",
    );

    expect(frame()?.className).toContain("opacity-0");

    await send({ source: "aster-calendar-panel", type: "ready" });

    expect(frame()?.className).toContain("opacity-100");
  });

  it("closes when the panel asks to", async () => {
    const on_close = vi.fn();

    await render_panel(true, on_close);
    await send({ source: "aster-calendar-panel", type: "close" });

    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("sends the theme to the panel at the Calendar origin", async () => {
    await render_panel(true);

    const target = frame()?.contentWindow;

    expect(target).toBeTruthy();

    const post = vi.spyOn(target as Window, "postMessage");

    await send({ source: "aster-calendar-panel", type: "ready" });

    expect(post).toHaveBeenLastCalledWith(
      { source: "aster-mail", type: "theme", theme: "light" },
      ORIGIN,
    );

    mocks.theme = "dark";
    await render_panel(true);

    expect(post).toHaveBeenLastCalledWith(
      { source: "aster-mail", type: "theme", theme: "dark" },
      ORIGIN,
    );
    expect(frame()?.getAttribute("src")).toBe(
      `${ORIGIN}/mail-panel?theme=light`,
    );
  });

  it("shows a retry state when the panel never becomes ready", async () => {
    vi.useFakeTimers();
    await render_panel(true);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(frame()).toBeNull();
    expect(container.textContent).toContain("calendar.panel_load_failed");

    const buttons = Array.from(container.querySelectorAll("button"));
    const retry = buttons.find(
      (button) => button.textContent === "common.retry",
    );
    const open = buttons.find(
      (button) => button.textContent === "calendar.panel_open_calendar",
    );

    await act(async () => {
      open?.click();
    });

    expect(mocks.open_external).toHaveBeenCalledWith(ORIGIN);

    await act(async () => {
      retry?.click();
    });

    expect(frame()).not.toBeNull();
    expect(container.textContent).not.toContain("calendar.panel_load_failed");
  });

  it("stays ready once the panel has reported in", async () => {
    vi.useFakeTimers();
    await render_panel(true);
    await send({ source: "aster-calendar-panel", type: "ready" });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(frame()?.className).toContain("opacity-100");
  });
});
