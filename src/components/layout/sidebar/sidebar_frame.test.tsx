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
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SidebarFrame } from "./sidebar_frame";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render_frame() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <SidebarFrame
        footer={<button type="button">storage</button>}
        header={<button type="button">compose</button>}
        list={<nav>folders</nav>}
      />,
    );
  });

  return container.querySelector("[data-sidebar-frame]") as HTMLElement;
}

describe("SidebarFrame", () => {
  it("scrolls as a whole so the footer stays reachable", () => {
    const frame = render_frame();

    expect(frame.className).toContain("overflow-y-auto");
    expect(frame.className).toContain("min-h-0");
    expect(frame.className).toContain("flex-1");
  });

  it("keeps the footer out of the list and stops it from shrinking", () => {
    const frame = render_frame();
    const list = frame.querySelector("[data-sidebar-list]") as HTMLElement;
    const footer = frame.querySelector("[data-sidebar-footer]") as HTMLElement;

    expect(list.textContent).toBe("folders");
    expect(list.className).toContain("flex-1");
    expect(footer.textContent).toBe("storage");
    expect(footer.className).toContain("flex-shrink-0");
    expect(frame.lastElementChild).toBe(footer);
  });
});
