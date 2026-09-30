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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type HelpersModule = typeof import("./sandboxed_email_renderer/helpers");

const set_container_width = (width: number | null): void => {
  document.body.innerHTML = "";
  if (width === null) return;

  const container = document.createElement("div");

  container.className = "email-frame-container";
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    value: width,
  });
  document.body.appendChild(container);
};

const load_helpers = async (): Promise<HelpersModule> => {
  vi.resetModules();

  return import("./sandboxed_email_renderer/helpers");
};

describe("iframe height cache width tracking", () => {
  let now = 0;

  beforeEach(() => {
    now = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("drops cached heights when the viewer is measured at a new width", async () => {
    const helpers = await load_helpers();

    set_container_width(900);
    helpers.store_height("email_1", 400);
    expect(helpers.get_cached_iframe_height("email_1")).toBe(400);

    now += 1000;
    set_container_width(600);

    expect(helpers.get_cached_iframe_height("email_1")).toBeUndefined();
  });

  it("keeps looking for the width while the viewer is unmounted", async () => {
    const helpers = await load_helpers();

    set_container_width(900);
    helpers.store_height("email_1", 400);

    now += 1000;
    set_container_width(null);
    expect(helpers.get_cached_iframe_height("email_1")).toBe(400);

    set_container_width(600);

    expect(helpers.get_cached_iframe_height("email_1")).toBeUndefined();
  });

  it("still reports a usable width for preload rendering when unmounted", async () => {
    const helpers = await load_helpers();

    set_container_width(900);
    expect(helpers.email_viewer_measure_width()).toBe(900);

    set_container_width(null);
    expect(helpers.email_viewer_measure_width()).toBe(900);
    expect(helpers.live_viewer_measure_width()).toBe(0);
  });
});
