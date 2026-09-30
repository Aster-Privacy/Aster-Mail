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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  block_external_content: true,
}));

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({ handle_external_link: vi.fn() }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences_optional: () => ({
    preferences: {
      block_external_content: h.block_external_content,
      block_remote_images: true,
      block_remote_fonts: true,
      block_remote_css: true,
      block_tracking_pixels: true,
    },
  }),
}));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy")>()),
  get_image_proxy_url: () => "",
}));

import { QuotedHtmlPreview } from "@/components/compose/quoted_html_preview";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render(element: React.ReactElement): { container: HTMLDivElement } {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(element);
  });
  mounted.push({ root, container });

  return { container };
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
});

const HTML = [
  "<style>body { color: red; }</style>",
  "<p>Hello</p>",
  '<img src="https://tracker.example/pixel.png" alt="remote" />',
  '<img src="cid:inline-1" alt="inline" />',
  '<img src="data:image/png;base64,iVBORw0KGgo=" alt="data" />',
].join("");

describe("QuotedHtmlPreview", () => {
  it("blocks remote images and strips style blocks when external content is blocked", () => {
    h.block_external_content = true;

    const { container } = render(<QuotedHtmlPreview html={HTML} />);
    const markup = container.innerHTML;
    const sources = Array.from(container.querySelectorAll("img")).map(
      (img) => img.getAttribute("src") ?? "",
    );

    expect(markup).not.toContain("<style");
    expect(sources.some((src) => src.includes("tracker.example"))).toBe(false);
    expect(markup).toContain("Hello");
  });

  it("keeps data images when external content is blocked", () => {
    h.block_external_content = true;

    const { container } = render(<QuotedHtmlPreview html={HTML} />);
    const sources = Array.from(container.querySelectorAll("img")).map(
      (img) => img.getAttribute("src") ?? "",
    );

    expect(sources.some((src) => src.startsWith("data:image/png"))).toBe(true);
    expect(sources.some((src) => src.startsWith("https://tracker"))).toBe(
      false,
    );
  });

  it("loads remote images when the user allows external content", () => {
    h.block_external_content = false;

    const { container } = render(<QuotedHtmlPreview html={HTML} />);
    const markup = container.innerHTML;

    expect(markup).toContain("tracker.example");
    expect(markup).not.toContain("<style");
  });
});
