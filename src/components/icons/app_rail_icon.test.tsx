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
    "renders the %s brand artwork at every pixel density",
    (name) => {
      act(() => root.render(<AppRailIcon name={name} />));

      const image = container.querySelector("img.app_rail_icon");
      const base = `/icons/${name}/${name}_rail`;

      expect(image?.getAttribute("src")).toBe(`${base}_24.png`);
      expect(image?.getAttribute("srcset")).toBe(
        `${base}_24.png 1x, ${base}_48.png 2x, ${base}_72.png 3x`,
      );
      expect(image?.getAttribute("alt")).toBe("");
      expect(image?.getAttribute("aria-hidden")).toBe("true");
      expect(image?.getAttribute("width")).toBe("24");
      expect(image?.getAttribute("height")).toBe("24");
    },
  );

  it.each(["contacts", "security"] as const)(
    "falls back to a vector icon when the %s artwork fails to load",
    (name) => {
      act(() => root.render(<AppRailIcon name={name} />));

      act(() => {
        container.querySelector("img")?.dispatchEvent(new Event("error"));
      });

      expect(container.querySelector(".app_rail_icon")).toBeNull();
      expect(container.querySelector("svg")).not.toBeNull();
    },
  );

  it("renders the calendar rail icon from the static artwork", () => {
    act(() => root.render(<AppRailIcon name="calendar" />));

    const icon = container.querySelector("svg.app_rail_icon");

    expect(icon?.getAttribute("data-dated-calendar-icon")).toBe("rail");
    expect(icon?.querySelector("image")?.getAttribute("href")).toBe(
      "/icons/calendar/calendar_rail_256.png",
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to a vector icon when the calendar artwork fails", () => {
    act(() => root.render(<AppRailIcon name="calendar" />));

    act(() => {
      container.querySelector("image")?.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector(".app_rail_icon")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
