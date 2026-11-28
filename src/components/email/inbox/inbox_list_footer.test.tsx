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

const list_sessions = vi.fn();
const open_external = vi.fn();
const open_settings_target = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}|${Object.values(params).join("|")}` : key,
  }),
}));
vi.mock("@/services/api/sessions", () => ({ list_sessions }));
vi.mock("@/utils/open_link", () => ({ open_external }));
vi.mock("@/lib/settings_links", () => ({
  open_settings_target,
  SECURITY_CENTER_TARGETS: { sessions: { section: "security" } },
}));

const { InboxListFooter, reset_inbox_footer_cache, format_relative_activity } =
  await import("./inbox_list_footer");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(used: number, total: number) {
  await act(async () => {
    root!.render(
      <InboxListFooter storage_total_bytes={total} storage_used_bytes={used} />,
    );
  });
}

function button(text: string): HTMLButtonElement {
  return Array.from(container!.querySelectorAll("button")).find((b) =>
    b.textContent?.startsWith(text),
  ) as HTMLButtonElement;
}

beforeEach(() => {
  reset_inbox_footer_cache();
  list_sessions.mockReset();
  open_external.mockReset();
  open_settings_target.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("InboxListFooter", () => {
  it("shows the storage bar and opens storage settings", async () => {
    list_sessions.mockResolvedValue({ data: { sessions: [] } });
    await render(250, 1000);

    const bar = container!.querySelector('[role="progressbar"]');

    expect(bar?.getAttribute("aria-valuenow")).toBe("25");
    act(() => button("settings.storage_used_of_total").click());
    expect(open_settings_target).toHaveBeenCalledWith({ section: "storage" });
  });

  it("hides storage when the quota is unknown", async () => {
    list_sessions.mockResolvedValue({ data: { sessions: [] } });
    await render(0, 0);

    expect(container!.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("reports the most recent activity on another device", async () => {
    const recent = new Date(Date.now() - 7 * 60_000).toISOString();
    const older = new Date(Date.now() - 3 * 3_600_000).toISOString();

    list_sessions.mockResolvedValue({
      data: {
        sessions: [
          { is_current: true, last_active: new Date().toISOString() },
          { is_current: false, last_active: older },
          { is_current: false, last_active: recent },
        ],
      },
    });
    await render(1, 10);

    expect(container!.textContent).toContain(
      `settings.inbox_footer_other_device_activity|${format_relative_activity(recent)}`,
    );
  });

  it("says when only this device is signed in", async () => {
    list_sessions.mockResolvedValue({
      data: { sessions: [{ is_current: true, last_active: "2026-11-27" }] },
    });
    await render(1, 10);

    expect(container!.textContent).toContain(
      "settings.inbox_footer_only_this_device",
    );
  });

  it("opens the legal pages", async () => {
    list_sessions.mockResolvedValue({ data: { sessions: [] } });
    await render(1, 10);

    act(() => button("settings.inbox_footer_terms").click());
    act(() => button("settings.inbox_footer_privacy").click());
    expect(open_external.mock.calls.map((call) => call[0])).toEqual([
      "https://astermail.org/terms",
      "https://astermail.org/privacy",
    ]);
  });
});
