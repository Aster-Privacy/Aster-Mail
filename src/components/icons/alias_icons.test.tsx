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

import { AliasAtIcon, GhostMaskIcon } from "@/components/icons/alias_icons";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("alias icons", () => {
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

  it("draws the at icon in the current text color", () => {
    act(() => root.render(<AliasAtIcon height={16} width={16} />));

    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.querySelectorAll("path").length).toBe(2);
  });

  it("lets the class name size the ghost icon", () => {
    act(() => root.render(<GhostMaskIcon className="w-4 h-4" />));

    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBeNull();
    expect(svg?.getAttribute("class")).toBe("w-4 h-4");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelectorAll("path").length).toBe(3);
  });

  it("keeps the two icons distinct", () => {
    act(() =>
      root.render(
        <>
          <AliasAtIcon width={20} />
          <GhostMaskIcon width={20} />
        </>,
      ),
    );

    const [at, ghost] = container.querySelectorAll("svg");

    expect(at.innerHTML).not.toBe(ghost.innerHTML);
  });
});
