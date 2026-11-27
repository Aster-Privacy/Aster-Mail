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
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TopBarLogo } from "./top_bar_logo";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render_logo(is_rail_header: boolean) {
  act(() => {
    root.render(<TopBarLogo is_rail_header={is_rail_header} />);
  });
}

function logo_images() {
  return Array.from(container.querySelectorAll("img"));
}

function logo(name: string) {
  return container.querySelector(`img[data-logo="${name}"]`) as HTMLElement;
}

describe("TopBarLogo", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps every logo image mounted across a collapse and expand", () => {
    render_logo(false);
    const before = logo_images();

    render_logo(true);
    const collapsed = logo_images();

    render_logo(false);
    const after = logo_images();

    expect(before).toHaveLength(3);
    expect(collapsed).toEqual(before);
    expect(after).toEqual(before);
  });

  it("never renders alt text that could paint while an image loads", () => {
    render_logo(true);

    for (const img of logo_images()) {
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("shows only the rail mark in the rail header", () => {
    render_logo(true);

    expect(logo("rail").classList.contains("hidden")).toBe(false);
    expect(logo("wordmark_light").classList.contains("hidden")).toBe(true);
    expect(logo("wordmark_dark").classList.contains("hidden")).toBe(true);
    expect(logo("wordmark_dark").classList.contains("dark:block")).toBe(false);
  });

  it("shows the theme wordmarks in the expanded header", () => {
    render_logo(false);

    expect(logo("rail").classList.contains("hidden")).toBe(true);
    expect(logo("wordmark_light").classList.contains("hidden")).toBe(false);
    expect(logo("wordmark_light").classList.contains("dark:hidden")).toBe(true);
    expect(logo("wordmark_dark").classList.contains("dark:block")).toBe(true);
  });
});
