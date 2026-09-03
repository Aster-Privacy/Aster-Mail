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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const show_storage_full_upgrade_mock = vi.fn();
const stats_state = {
  stats: { storage_used_bytes: 0, storage_total_bytes: 1073741824 },
  has_initialized: true,
};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/stores/upgrade_store", () => ({
  show_storage_full_upgrade: (...args: unknown[]) =>
    show_storage_full_upgrade_mock(...args),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  use_mail_stats: () => stats_state,
}));

const { MobileStorageBanner } = await import("./mobile_storage_banner");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_with(used: number, total: number, initialized = true) {
  stats_state.stats = {
    storage_used_bytes: used,
    storage_total_bytes: total,
  };
  stats_state.has_initialized = initialized;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MobileStorageBanner />);
  });

  return container;
}

describe("MobileStorageBanner", () => {
  beforeEach(async () => {
    show_storage_full_upgrade_mock.mockClear();
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("warns that storage is full", async () => {
    const view = await render_with(1073741824, 1073741824);

    expect(view.textContent).toContain("settings.storage_locked_title");
  });

  it("warns before storage runs out", async () => {
    const view = await render_with(1000000000, 1073741824);

    expect(view.textContent).toContain("settings.storage_warning_title");
  });

  it("stays hidden with room to spare", async () => {
    const view = await render_with(100000000, 1073741824);

    expect(view.textContent).toBe("");
  });

  it("stays hidden until the stats have loaded", async () => {
    const view = await render_with(1073741824, 1073741824, false);

    expect(view.textContent).toBe("");
  });

  it("opens the upgrade pop-up without leaving the page", async () => {
    const view = await render_with(1073741824, 1073741824);
    const button = view.querySelector("button");

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(show_storage_full_upgrade_mock).toHaveBeenCalledTimes(1);
  });
});
