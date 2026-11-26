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

import { AppRailIcon } from "./app_rail_icon";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OUTLINE_ICON_PATHS = [
  "M6.75 3v2.25M17.25 3v2.25",
  "M15 19.128a9.38 9.38 0 0 0 2.625.372",
];

function expect_no_outline_icon(container: HTMLElement) {
  const markup = container.innerHTML;

  for (const path of OUTLINE_ICON_PATHS) {
    expect(markup).not.toContain(path);
  }
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg[stroke]")).toBeNull();
}

describe("app rail icon", () => {
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

  it.each(["contacts", "security"] as const)(
    "draws the %s brand artwork from the bundle",
    (name) => {
      act(() => root.render(<AppRailIcon name={name} />));

      const icon = container.querySelector("svg.app_rail_icon");
      const href = icon?.querySelector("image")?.getAttribute("href");

      expect(icon?.getAttribute("data-app-rail-icon")).toBe(name);
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(icon?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(href?.startsWith("data:image/png;base64,")).toBe(true);
      expect_no_outline_icon(container);
    },
  );

  it("draws the dated calendar from the bundled rail artwork", () => {
    act(() => root.render(<AppRailIcon name="calendar" />));

    const icon = container.querySelector("svg.app_rail_icon");
    const href = icon?.querySelector("image")?.getAttribute("href");

    expect(icon?.getAttribute("data-dated-calendar-icon")).toBe("rail");
    expect(href?.startsWith("data:image/png;base64,")).toBe(true);
    expect_no_outline_icon(container);
  });

  it.each(["calendar", "contacts", "security"] as const)(
    "keeps the %s brand artwork when the image reports an error",
    (name) => {
      act(() => root.render(<AppRailIcon name={name} />));

      const before = container.innerHTML;

      act(() => {
        container.querySelector("image")?.dispatchEvent(new Event("error"));
      });

      expect(container.innerHTML).toBe(before);
      expect(container.querySelector("svg.app_rail_icon image")).not.toBeNull();
      expect_no_outline_icon(container);
    },
  );
});
