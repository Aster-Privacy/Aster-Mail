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

import { dismiss_toast, show_toast } from "@/components/toast/simple_toast";
import {
  clear_plan_cache,
  get_current_plan_code,
} from "@/services/plan_limits";

const plan_state = vi.hoisted(() => ({
  limits: { plan_code: "star" } as { plan_code: string } | null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.client ? `${key}:${params.client}` : key,
  }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: plan_state.limits,
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
  show_toast: vi.fn(() => "opening-toast"),
  dismiss_toast: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocked_toast = vi.mocked(show_toast);
const mocked_dismiss = vi.mocked(dismiss_toast);
const mocked_plan_code = vi.mocked(get_current_plan_code);
const mocked_clear_plan = vi.mocked(clear_plan_cache);

function error_toasts() {
  return mocked_toast.mock.calls.filter(([, kind]) => kind === "error");
}

describe("TrustedDevicesPanel desktop client setup", () => {
  let container: HTMLDivElement;
  let root: Root;
  let opened_urls: string[];
  const original_location = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    plan_state.limits = { plan_code: "star" };
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

  it("says Bridge is opening as soon as a client is picked", async () => {
    await click_set_up("Thunderbird");

    expect(mocked_toast).toHaveBeenCalledTimes(1);
    expect(mocked_toast.mock.calls[0][0]).toBe(
      "settings.desktop_bridge_opening",
    );
    expect(mocked_toast.mock.calls[0][1]).toBe("info");
    expect(mocked_dismiss).not.toHaveBeenCalled();
  });

  it("explains how to get Bridge when nothing opened the link", async () => {
    await click_set_up("Apple Mail");
    expect(error_toasts()).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(mocked_dismiss).toHaveBeenCalledWith("opening-toast");
    expect(error_toasts()).toHaveLength(1);
    const [message, kind, , action] = error_toasts()[0];

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

    expect(mocked_dismiss).toHaveBeenCalledWith("opening-toast");
    expect(error_toasts()).toHaveLength(0);
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

    expect(mocked_dismiss).toHaveBeenCalledWith("opening-toast");
    expect(error_toasts()).toHaveLength(0);
  });

  it("trusts a paid plan it already knows without asking again", async () => {
    await click_set_up("Thunderbird");

    expect(mocked_clear_plan).not.toHaveBeenCalled();
    expect(mocked_plan_code).not.toHaveBeenCalled();
    expect(opened_urls).toEqual(["aster-mail://provision?label=Thunderbird"]);
  });

  it("checks the plan again when it is not known yet", async () => {
    plan_state.limits = null;
    let resolve_plan: (code: string) => void = () => {};

    mocked_plan_code.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolve_plan = resolve;
        }),
    );
    await click_set_up("Outlook");

    expect(mocked_clear_plan).toHaveBeenCalledTimes(1);
    expect(mocked_plan_code).toHaveBeenCalledTimes(1);
    expect(mocked_toast.mock.calls[0][0]).toBe(
      "settings.desktop_bridge_opening",
    );
    expect(opened_urls).toEqual([]);

    await act(async () => {
      resolve_plan("star");
    });

    expect(opened_urls).toEqual(["aster-mail://provision?label=Outlook"]);
  });

  it("offers the upgrade instead when the fresh plan is free", async () => {
    plan_state.limits = null;
    mocked_plan_code.mockResolvedValueOnce("free");
    await click_set_up("Generic IMAP");

    expect(mocked_clear_plan).toHaveBeenCalledTimes(1);
    expect(opened_urls).toEqual([]);
    expect(mocked_dismiss).toHaveBeenCalledWith("opening-toast");

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(error_toasts()).toHaveLength(0);
  });
});
