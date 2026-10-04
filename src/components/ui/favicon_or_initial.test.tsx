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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const loaded = vi.hoisted(() => ({ value: "data:pending" }));

vi.mock("@/hooks/use_favicon_src", () => ({
  use_favicon_src: (domain: string, enabled = true) =>
    enabled && domain ? loaded.value : "data:pending",
}));

const { FaviconOrInitial, FaviconImg } = await import("./favicon_or_initial");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; container: HTMLDivElement } | null = null;

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });
  mounted = { root, container };

  return container;
}

function image_sources(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img")).map(
    (img) => img.getAttribute("src") ?? "",
  );
}

afterEach(() => {
  if (mounted) {
    act(() => {
      mounted!.root.unmount();
    });
    mounted.container.remove();
    mounted = null;
  }
  loaded.value = "data:pending";
});

describe("FaviconOrInitial", () => {
  it("shows the initial while a same-origin favicon loads", () => {
    const container = render(
      <FaviconOrInitial initial="S" src="/api/images/v1/favicon/shop.example" />,
    );

    expect(image_sources(container)).toEqual([]);
    expect(container.textContent).toBe("S");
  });

  it("shows the cookieless blob instead of the api url", () => {
    loaded.value = "blob:local/shop";
    const container = render(
      <FaviconOrInitial initial="S" src="/api/images/v1/favicon/shop.example" />,
    );

    expect(image_sources(container)).toEqual(["blob:local/shop"]);
  });

  it("passes other sources through unchanged", () => {
    const container = render(
      <FaviconOrInitial
        initial="S"
        src="https://app.astermail.org/api/images/v1/favicon/shop.example"
      />,
    );

    expect(image_sources(container)).toEqual([
      "https://app.astermail.org/api/images/v1/favicon/shop.example",
    ]);
  });
});

describe("FaviconImg", () => {
  it("never renders the api url", () => {
    loaded.value = "blob:local/shop";
    const container = render(<FaviconImg domain="shop.example" />);

    expect(image_sources(container)).toEqual(["blob:local/shop"]);
  });
});
