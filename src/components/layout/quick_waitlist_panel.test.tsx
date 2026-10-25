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

import { QuickWaitlistPanel } from "./quick_waitlist_panel";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
}));

vi.mock("@/services/api/calendar_waitlist", () => ({
  get_calendar_waitlist_status: api.get,
  join_calendar_waitlist: api.join,
  leave_calendar_waitlist: api.leave,
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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("quick waitlist panel", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_panel = async () => {
    await act(async () => {
      root.render(
        <QuickWaitlistPanel
          is_open={true}
          is_swapping={false}
          on_close={() => {}}
        />,
      );
    });
  };

  const button_with = (text: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === text,
    );

  beforeEach(() => {
    api.get.mockReset();
    api.join.mockReset();
    api.leave.mockReset();
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

  it("joins the waitlist and shows the confirmation", async () => {
    api.get.mockResolvedValue({ joined: false, joined_at: null });
    api.join.mockResolvedValue({
      joined: true,
      joined_at: "2026-10-25T00:00:00Z",
    });
    await render_panel();

    expect(container.textContent).toContain("calendar.beta_waitlist_body");
    await act(async () => {
      button_with("calendar.beta_waitlist_apply")?.click();
    });

    expect(api.join).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("calendar.beta_waitlist_joined");
    expect(button_with("calendar.beta_waitlist_leave")).toBeDefined();
  });

  it("leaves the waitlist", async () => {
    api.get.mockResolvedValue({
      joined: true,
      joined_at: "2026-10-25T00:00:00Z",
    });
    api.leave.mockResolvedValue({ joined: false, joined_at: null });
    await render_panel();

    await act(async () => {
      button_with("calendar.beta_waitlist_leave")?.click();
    });

    expect(api.leave).toHaveBeenCalledTimes(1);
    expect(button_with("calendar.beta_waitlist_apply")).toBeDefined();
  });

  it("shows an error and keeps the apply button when the request fails", async () => {
    api.get.mockResolvedValue({ joined: false, joined_at: null });
    api.join.mockRejectedValue(new Error("calendar_waitlist_unavailable"));
    await render_panel();

    await act(async () => {
      button_with("calendar.beta_waitlist_apply")?.click();
    });

    expect(container.querySelector("[role=alert]")?.textContent).toBe(
      "calendar.beta_waitlist_failed",
    );
    expect(button_with("calendar.beta_waitlist_apply")).toBeDefined();
  });

  it("offers a retry when the status cannot load", async () => {
    api.get.mockRejectedValueOnce(new Error("calendar_waitlist_unavailable"));
    api.get.mockResolvedValueOnce({ joined: false, joined_at: null });
    await render_panel();

    expect(container.querySelector("[role=alert]")?.textContent).toBe(
      "calendar.beta_waitlist_failed",
    );
    expect(button_with("calendar.beta_waitlist_apply")).toBeUndefined();
    expect(button_with("calendar.beta_waitlist_leave")).toBeUndefined();

    await act(async () => {
      button_with("calendar.beta_waitlist_retry")?.click();
    });

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(button_with("calendar.beta_waitlist_apply")).toBeDefined();
  });

  it("sends one request when apply is pressed twice", async () => {
    let resolve_join: (value: unknown) => void = () => {};

    api.get.mockResolvedValue({ joined: false, joined_at: null });
    api.join.mockReturnValue(
      new Promise((resolve) => {
        resolve_join = resolve;
      }),
    );
    await render_panel();

    const apply = button_with("calendar.beta_waitlist_apply");

    await act(async () => {
      apply?.click();
      apply?.click();
    });
    await act(async () => {
      resolve_join({ joined: true, joined_at: "2026-10-25T00:00:00Z" });
    });

    expect(api.join).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("calendar.beta_waitlist_joined");
  });

  it("shows the privacy note and the temporary icon note", async () => {
    api.get.mockResolvedValue({ joined: false, joined_at: null });
    await render_panel();

    expect(container.textContent).toContain("calendar.beta_waitlist_badge");
    expect(container.textContent).toContain("calendar.beta_waitlist_privacy");
    expect(container.textContent).toContain("calendar.beta_waitlist_icon_note");
    expect(container.querySelectorAll("li")).toHaveLength(3);
  });
});
