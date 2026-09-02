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

import { update_progress_percent } from "@/services/updates/updater";

type UpdaterEvent = {
  event: "Started" | "Progress" | "Finished";
  data?: { contentLength?: number; chunkLength?: number };
};

let emit: ((event: UpdaterEvent) => void) | null = null;
let finish_download: (() => void) | null = null;
let content_length: number | undefined = 1000;

const relaunch = vi.fn(async () => {});

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: async () => ({
    version: "1.5.0",
    currentVersion: "1.4.63",
    downloadAndInstall: (on_event?: (event: UpdaterEvent) => void) => {
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

describe("UpdateBanner download progress", () => {
  let container: HTMLDivElement;
  let root: Root;

  const button_text = () =>
    container.querySelectorAll("button")[0]?.textContent ?? "";

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

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    emit = null;
    finish_download = null;
    content_length = 1000;
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

  it("shows a live percentage and a progress bar while downloading", async () => {
    await mount();

    expect(button_text()).toBe("settings.updates_banner_action");
    expect(bar()).toBeNull();

    await act(async () => {
      container.querySelectorAll("button")[0].click();
    });
    await act(async () => {});

    expect(emit).not.toBeNull();

    await act(async () => {
      emit!({ event: "Started", data: { contentLength: content_length } });
    });
    expect(button_text()).toBe('settings.updates_installing|{"percent":0}');
    expect(bar()?.getAttribute("aria-valuenow")).toBe("0");

    await act(async () => {
      emit!({ event: "Progress", data: { chunkLength: 250 } });
    });
    expect(button_text()).toBe('settings.updates_installing|{"percent":25}');

    await act(async () => {
      emit!({ event: "Progress", data: { chunkLength: 500 } });
    });
    expect(button_text()).toBe('settings.updates_installing|{"percent":75}');
    expect((bar()?.firstElementChild as HTMLElement | null)?.style.width).toBe(
      "75%",
    );

    await act(async () => {
      emit!({ event: "Finished" });
      finish_download!();
    });
    await act(async () => {});

    expect(relaunch).toHaveBeenCalled();
  });

  it("falls back to an indeterminate label when the size is unknown", async () => {
    await mount();

    await act(async () => {
      container.querySelectorAll("button")[0].click();
    });
    await act(async () => {});

    expect(button_text()).toBe("settings.updates_downloading");

    await act(async () => {
      emit!({ event: "Started", data: {} });
    });
    expect(button_text()).toBe("settings.updates_downloading");
    expect(bar()?.hasAttribute("aria-valuenow")).toBe(false);

    await act(async () => {
      emit!({ event: "Progress", data: { chunkLength: 500 } });
    });
    expect(button_text()).toBe("settings.updates_downloading");
  });
});
