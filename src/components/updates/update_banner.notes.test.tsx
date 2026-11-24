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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { FIRST_CHECK_DELAY_MS, UpdateBanner } from "./update_banner";

import * as updater from "@/services/updates/updater";

const MANIFEST_NOTES =
  "## What's new\n- Your session ended. Enter your password at the sign-in page to finish updating.";

const h = vi.hoisted(() => ({
  version: "1.5.0",
  open_external: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: async () => ({
    version: h.version,
    currentVersion: "1.4.63",
    body: MANIFEST_NOTES,
    downloadAndInstall: async () => {},
    download: async () => {},
    install: async () => {},
  }),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: async () => {},
}));

vi.mock("@/utils/open_link", () => ({
  open_external: h.open_external,
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

describe("update notes", () => {
  let container: HTMLDivElement;
  let root: Root;

  const button_with = (text: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === text,
    );

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
    h.version = "1.5.0";
    h.open_external.mockReset();
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

  it("drops the unsigned manifest notes from the update check", async () => {
    const info = await updater.check_for_update();

    expect(info?.version).toBe("1.5.0");
    expect(JSON.stringify(info)).not.toContain("password");
  });

  it("never shows manifest notes and opens the release page instead", async () => {
    await mount();

    const whats_new = button_with("settings.updates_whats_new");

    expect(whats_new).toBeDefined();
    await act(async () => {
      whats_new!.click();
    });
    await act(async () => {});

    expect(container.textContent).not.toContain("password");
    expect(h.open_external).toHaveBeenCalledWith(
      "https://github.com/Aster-Privacy/Aster-Mail/releases/tag/v1.5.0",
    );
  });

  it("hides the link when the version is not a plain release number", async () => {
    h.version = "1.5.0/../../evil";
    await mount();

    expect(button_with("settings.updates_whats_new")).toBeUndefined();
  });
});
