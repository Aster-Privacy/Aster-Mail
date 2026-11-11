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
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MobileExternalContentBanner } from "@/pages/mobile/mobile_detail_banners";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const REPORT: ExternalContentReport = {
  has_remote_images: true,
  has_remote_fonts: false,
  has_remote_css: false,
  has_tracking_pixels: true,
  blocked_count: 2,
  blocked_items: [
    { url: "https://cdn.shop.example/a.jpg", type: "image" },
    { url: "https://open.metrics.example/o.gif", type: "tracking_pixel" },
  ],
  cleaned_links: [],
};

const t = ((key: string) => key) as Parameters<
  typeof MobileExternalContentBanner
>[0]["t"];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function load_button(): HTMLButtonElement | null {
  return container.querySelector("[data-testid='load-external-content']");
}

function settings_button(): HTMLButtonElement | null {
  return container.querySelector("[data-testid='image-loading-settings']");
}

describe("MobileExternalContentBanner image loading modes", () => {
  it("offers the per-message load action when one is given", () => {
    const on_load = vi.fn();
    const on_open_settings = vi.fn();

    act(() => {
      root.render(
        <MobileExternalContentBanner
          on_load={on_load}
          on_open_settings={on_open_settings}
          report={REPORT}
          t={t}
        />,
      );
    });

    expect(settings_button()).toBe(null);
    act(() => load_button()!.click());
    expect(on_load).toHaveBeenCalledTimes(1);
    expect(on_open_settings).not.toHaveBeenCalled();
  });

  it("links to the setting and offers no load action when none is given", () => {
    const on_open_settings = vi.fn();

    act(() => {
      root.render(
        <MobileExternalContentBanner
          on_open_settings={on_open_settings}
          report={REPORT}
          t={t}
        />,
      );
    });

    expect(load_button()).toBe(null);
    expect(container.textContent).not.toContain("common.load_content");
    act(() => settings_button()!.click());
    expect(on_open_settings).toHaveBeenCalledTimes(1);
  });
});
