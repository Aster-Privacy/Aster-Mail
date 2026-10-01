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

import { EmailOpenSkeleton } from "./email_open_skeleton";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const classes_of = (el: Element | null | undefined): string[] =>
  (el?.className ?? "").split(/\s+/).filter(Boolean);

describe("EmailOpenSkeleton column", () => {
  let container: HTMLDivElement;
  let root: Root;

  const column = () =>
    container.querySelector('[aria-busy="true"]')?.firstElementChild;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("spans the reading pane like the split and full-page viewers", () => {
    act(() => root.render(<EmailOpenSkeleton variant="split" />));

    expect(classes_of(column())).toContain("w-full");
    expect(
      classes_of(column()).filter(
        (c) => c === "mx-auto" || c.startsWith("max-w-"),
      ),
    ).toEqual([]);
  });

  it("keeps the width of a viewer that caps its own content", () => {
    act(() => root.render(<EmailOpenSkeleton variant="popup" />));

    expect(classes_of(column())).toEqual(
      expect.arrayContaining(["mx-auto", "w-full", "max-w-4xl"]),
    );
  });
});
