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

import { FIRST_CHECK_DELAY_MS, UpdateBanner } from "./update_banner";
import { estimate_seconds_left } from "./use_update_installer";

import { update_progress_percent } from "@/services/updates/updater";

type UpdaterEvent = {
  event: "Started" | "Progress" | "Finished";
  data?: { contentLength?: number; chunkLength?: number };
};

let emit: ((event: UpdaterEvent) => void) | null = null;
let finish_download: (() => void) | null = null;
let content_length: number | undefined = 1000;
let fail_download = false;

const relaunch = vi.fn(async () => {});

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: async () => ({
    version: "1.5.0",
    currentVersion: "1.4.63",
    downloadAndInstall: (on_event?: (event: UpdaterEvent) => void) => {
      if (fail_download) return Promise.reject(new Error("network"));
      emit = (event) => on_event?.(event);

      return new Promise<void>((resolve) => {
        finish_download = resolve;
      });
    },
    download: async () => {},
    install: async () => {},
  }),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => relaunch(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars ? `${key}|${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("update_progress_percent", () => {
  it("returns null when the total size is unknown", () => {
    expect(update_progress_percent(null)).toBeNull();
    expect(update_progress_percent({ downloaded: 5, total: null })).toBeNull();
    expect(update_progress_percent({ downloaded: 5, total: 0 })).toBeNull();
  });

  it("clamps and rounds a known total", () => {
    expect(update_progress_percent({ downloaded: 0, total: 1000 })).toBe(0);
    expect(update_progress_percent({ downloaded: 333, total: 1000 })).toBe(33);
    expect(update_progress_percent({ downloaded: 1000, total: 1000 })).toBe(
      100,
    );
    expect(update_progress_percent({ downloaded: 9000, total: 1000 })).toBe(
      100,
    );
  });
});

describe("estimate_seconds_left", () => {
  it("waits for enough samples before estimating", () => {
    expect(estimate_seconds_left(100, 1000, 500)).toBeNull();
    expect(estimate_seconds_left(0, 1000, 5000)).toBeNull();
    expect(estimate_seconds_left(100, null, 5000)).toBeNull();
  });

  it("projects the remaining time from the average rate", () => {
    expect(estimate_seconds_left(250, 1000, 2000)).toBe(6);
  });
});

describe("UpdateBanner download progress", () => {
  let container: HTMLDivElement;
  let root: Root;

  const by_id = (id: string) =>
    container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  const phase = () =>
    container.querySelector<HTMLElement>("[data-phase]")?.dataset.phase;

  const button_with = (text: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === text,
    );

  const bar = () =>
    container.querySelector<HTMLElement>('[role="progressbar"]');

  const mount = async () => {
    await act(async () => {
      root.render(<UpdateBanner />);
    });
    await act(async () => {
      vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
    });
    await act(async () => {});
  };

  const click_install = async () => {
    await act(async () => {
      button_with("settings.updates_install_and_restart")!.click();
    });
    await act(async () => {});
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    emit = null;
    finish_download = null;
    content_length = 1000;
    fail_download = false;
    localStorage.clear();
    (
      window as unknown as { __TAURI_INTERNALS__?: unknown }
    ).__TAURI_INTERNALS__ = {};
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    vi.useRealTimers();
  });

  it("offers install, later, and dismiss before downloading", async () => {
    await mount();

    expect(phase()).toBe("idle");
    expect(by_id("update-title")?.textContent).toBe(
      'settings.updates_banner_title|{"version":"1.5.0"}',
    );
    expect(button_with("settings.updates_install_and_restart")).toBeDefined();
    expect(button_with("settings.updates_dismiss")).toBeDefined();
    expect(bar()).toBeNull();
  });

  it("shows a spinner, then live percent, size, and a progress bar", async () => {
    await mount();
    await click_install();

    expect(phase()).toBe("preparing");
    expect(by_id("update-spinner")).not.toBeNull();
    expect(button_with("settings.updates_dismiss")).toBeUndefined();
    expect(emit).not.toBeNull();

    await act(async () => {
      emit!({ event: "Started", data: { contentLength: content_length } });
    });
    expect(phase()).toBe("downloading");
    expect(by_id("update-percent")?.textContent).toBe("0%");
    expect(bar()?.getAttribute("aria-valuenow")).toBe("0");

    await act(async () => {
      emit!({ event: "Progress", data: { chunkLength: 250 } });
    });
    expect(by_id("update-percent")?.textContent).toBe("25%");

    await act(async () => {
      emit!({ event: "Progress", data: { chunkLength: 500 } });
    });
    expect(by_id("update-percent")?.textContent).toBe("75%");
    expect(by_id("update-progress-fill")?.style.width).toBe("75%");
    expect(by_id("update-detail")?.textContent).toContain(
      "settings.updates_card_size",
    );

    await act(async () => {
      emit!({ event: "Finished" });
    });
    expect(phase()).toBe("installing");
    expect(by_id("update-spinner")).not.toBeNull();
    expect(by_id("update-detail")?.textContent).toBe(
      "settings.updates_card_installing_detail",
    );

    await act(async () => {
      finish_download!();
    });
    await act(async () => {});

    expect(relaunch).toHaveBeenCalled();
  });

  it("keeps the spinner when the size is unknown", async () => {
    await mount();
    await click_install();

    await act(async () => {
      emit!({ event: "Started", data: {} });
    });
    await act(async () => {
      emit!({ event: "Progress", data: { chunkLength: 500 } });
    });

    expect(phase()).toBe("downloading");
    expect(by_id("update-percent")).toBeNull();
    expect(by_id("update-spinner")).not.toBeNull();
    expect(bar()?.hasAttribute("aria-valuenow")).toBe(false);
  });

  it("shows the failure inline with a retry", async () => {
    fail_download = true;
    await mount();
    await click_install();
    await act(async () => {});

    expect(phase()).toBe("failed");
    expect(by_id("update-title")?.textContent).toBe(
      "settings.updates_card_failed",
    );
    expect(button_with("settings.updates_try_again")).toBeDefined();
    expect(button_with("settings.updates_dismiss")).toBeDefined();
  });
});
