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

import { TrustedDevicesPanel } from "./trusted_devices_panel";

import { show_toast } from "@/components/toast/simple_toast";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.client ? `${key}:${params.client}` : key,
  }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: { plan_code: "star" },
    is_loading: false,
    load_failed: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/settings/hooks/use_settings_prefetch", () => ({
  use_settings_panel_data: () => ({
    data: { data: { devices: [] } },
    error: null,
    is_loading: false,
    revalidate: vi.fn(),
  }),
}));

vi.mock("@/services/api/devices", () => ({
  revoke_device: vi.fn(),
}));

vi.mock("@/services/plan_limits", () => ({
  clear_plan_cache: vi.fn(),
  get_current_plan_code: vi.fn(async () => "star"),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocked_toast = vi.mocked(show_toast);

describe("TrustedDevicesPanel desktop client setup", () => {
  let container: HTMLDivElement;
  let root: Root;
  let opened_urls: string[];
  const original_location = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    opened_urls = [];
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        get href() {
          return "https://mail.example.test/settings";
        },
        set href(value: string) {
          opened_urls.push(value);
        },
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original_location,
    });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function click_set_up(client: string) {
    await act(async () => {
      root.render(<TrustedDevicesPanel />);
    });
    const row = Array.from(container.querySelectorAll("button")).find((node) =>
      node.textContent?.includes(`settings.desktop_bridge_set_up:${client}`),
    );

    expect(row).toBeTruthy();
    await act(async () => {
      row?.click();
    });
  }

  it("opens the Bridge provisioning link", async () => {
    await click_set_up("Thunderbird");

    expect(opened_urls).toEqual(["aster-mail://provision?label=Thunderbird"]);
  });

  it("explains how to get Bridge when nothing opened the link", async () => {
    await click_set_up("Apple Mail");
    expect(mocked_toast).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(mocked_toast).toHaveBeenCalledTimes(1);
    const [message, kind, , action] = mocked_toast.mock.calls[0];

    expect(message).toBe("settings.desktop_bridge_not_opened");
    expect(kind).toBe("error");
    expect(action?.label).toBe("settings.bridge");

    const navigated: unknown[] = [];
    const listener = (event: Event) =>
      navigated.push((event as CustomEvent).detail);

    window.addEventListener("navigate-settings", listener);
    action?.on_click();
    window.removeEventListener("navigate-settings", listener);

    expect(navigated).toEqual(["bridge"]);
  });

  it("stays quiet when Bridge takes focus", async () => {
    await click_set_up("Outlook");

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      vi.advanceTimersByTime(3000);
    });

    expect(mocked_toast).not.toHaveBeenCalled();
  });

  it("stays quiet when the page is hidden by the handoff", async () => {
    await click_set_up("Generic IMAP");

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(3000);
    });
    visibility.mockRestore();

    expect(mocked_toast).not.toHaveBeenCalled();
  });
});
