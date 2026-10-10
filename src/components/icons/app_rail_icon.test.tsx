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
    "masks the %s artwork with the accent color",
    (name) => {
      act(() => root.render(<AppRailIcon name={name} />));

      const wrapper = container.querySelector<HTMLElement>(".app_rail_icon");
      const detail = container.querySelector("img");

      expect(
        wrapper?.style.getPropertyValue("--app-rail-icon-tint"),
      ).toContain(`/icons/${name}/${name}_tint_72.png`);
      expect(detail?.getAttribute("src")).toBe(
        `/icons/${name}/${name}_detail_24.png`,
      );
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
});
