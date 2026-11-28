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

import { AliasNavIcon } from "@/components/common/alias_nav_icon";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const photo = "data:image/png;base64,iVBORw0KGgo=";

describe("AliasNavIcon", () => {
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

  function render(profile_picture?: string) {
    act(() => {
      root.render(
        <AliasNavIcon
          picture_size={20}
          profile_picture={profile_picture}
          size={16}
        />,
      );
    });
  }

  it("shows the alias photo when one is set", () => {
    render(photo);

    const img = container.querySelector("img");

    expect(img?.getAttribute("src")).toBe(photo);
    expect(img?.style.width).toBe("20px");
  });

  it("shows the at icon when the alias has no photo", () => {
    render(undefined);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("draws the at icon at the glyph size", () => {
    render(undefined);

    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
  });

  it("treats a blank photo as no photo", () => {
    render("   ");

    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to the at icon when the photo fails to load", () => {
    render(photo);

    act(() => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows a new photo after an earlier one failed", () => {
    render(photo);
    act(() => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });

    render("data:image/png;base64,AAAA");

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,AAAA",
    );
  });
});
