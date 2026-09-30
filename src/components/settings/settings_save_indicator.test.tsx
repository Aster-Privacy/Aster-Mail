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

const stable_i18n = { t: (k: string) => k };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable_i18n,
}));

const save_now = vi.fn().mockResolvedValue(undefined);
let current_status = "idle";

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ save_status: current_status, save_now }),
}));

import {
  SettingsSaveIndicator,
  SettingsSaveIndicatorInline,
} from "./settings_save_indicator";

describe("settings save indicator", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    save_now.mockClear();
    current_status = "idle";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("says nothing while settings are idle", () => {
    act(() => root.render(<SettingsSaveIndicator />));
    expect(container.textContent).toBe("");
  });

  it("reports a save in flight", () => {
    current_status = "saving";
    act(() => root.render(<SettingsSaveIndicator />));
    expect(container.textContent).toContain("common.saving");
  });

  it("tells the user when a preference save failed", () => {
    current_status = "error";
    act(() => root.render(<SettingsSaveIndicator />));
    expect(container.textContent).toContain("common.settings_not_saved");
    expect(container.textContent).toContain("common.retry");
  });

  it("retries the save when the user asks", async () => {
    current_status = "error";
    act(() => root.render(<SettingsSaveIndicator />));

    const button = container.querySelector("button");

    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(save_now).toHaveBeenCalledTimes(1);
  });

  it("keeps the inline banner out of the way unless a save failed", () => {
    current_status = "saving";
    act(() => root.render(<SettingsSaveIndicatorInline />));
    expect(container.textContent).toBe("");

    current_status = "error";
    act(() => root.render(<SettingsSaveIndicatorInline />));
    expect(container.textContent).toContain("common.save_failed");
  });
});
