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
  load_remote_images: "never",
  defer_images: false,
  handle_external_link: vi.fn(),
}));

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({
    handle_external_link: h.handle_external_link,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences_optional: () => ({
    preferences: {
      block_external_content: h.block_external_content,
      load_remote_images: h.load_remote_images,
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

vi.mock("@/lib/image_proxy_grant", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy_grant")>()),
  should_defer_proxied_images: () => h.defer_images,
}));

vi.mock("@/lib/image_proxy", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy")>()),
  get_image_proxy_url: () => "https://app.example/api/images/v1/proxy",
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

  it("loads remote images when the image setting allows them", () => {
    h.block_external_content = false;
    h.load_remote_images = "always";

    try {
      const { container } = render(<QuotedHtmlPreview html={HTML} />);
      const markup = container.innerHTML;

      expect(markup).toContain("tracker.example");
      expect(markup).not.toContain("<style");
    } finally {
      h.load_remote_images = "never";
    }
  });

  it("holds remote images behind a placeholder until the grant loads them", () => {
    h.block_external_content = false;
    h.load_remote_images = "always";
    h.defer_images = true;
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>(() => undefined));

    try {
      const { container } = render(<QuotedHtmlPreview html={HTML} />);
      const remote = container.querySelector('img[alt="remote"]');

      expect(remote?.getAttribute("src")).toMatch(/^data:image\/gif;base64,/);
      expect(container.innerHTML).not.toContain("https://tracker.example");
    } finally {
      fetch_spy.mockRestore();
      h.load_remote_images = "never";
      h.defer_images = false;
    }
  });

  it("keeps blocking remote images when only tracking protection is off", () => {
    h.block_external_content = false;

    const { container } = render(<QuotedHtmlPreview html={HTML} />);
    const sources = Array.from(container.querySelectorAll("img")).map(
      (img) => img.getAttribute("src") ?? "",
    );

    expect(sources.some((src) => src.includes("tracker.example"))).toBe(false);
  });

  it("drops app classes and ids so quoted mail cannot cover the modal", () => {
    h.block_external_content = true;

    const { container } = render(
      <QuotedHtmlPreview
        html={
          '<div class="fixed inset-0 z-50 bg-white" id="root" style="position:fixed;inset:0">cover</div>' +
          '<div class="aster_quote"><blockquote class="aster_quote_body">quoted</blockquote></div>'
        }
      />,
    );
    const cover = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent === "cover",
    );

    expect(cover).toBeDefined();
    expect(cover!.hasAttribute("class")).toBe(false);
    expect(cover!.getAttribute("id")).toBe("aster_anchor_root");
    expect(document.getElementById("root")).not.toBe(cover);
    expect(cover!.getAttribute("style") ?? "").not.toMatch(/fixed/i);
    expect(
      container.querySelector(".aster_quote .aster_quote_body"),
    ).not.toBeNull();
  });
});

describe("QuotedHtmlPreview named properties", () => {
  it("keeps quoted ids and names from shadowing window globals", () => {
    h.block_external_content = true;

    const { container } = render(
      <QuotedHtmlPreview
        html={
          '<div id="__TAURI_INTERNALS__">a</div>' +
          '<img name="__TAURI_INTERNALS__" src="data:image/png;base64,iVBORw0KGgo=">' +
          '<form name="__TAURI_INTERNALS__"><input name="invoke"></form>' +
          '<embed name="__TAURI_INTERNALS__"><object name="__TAURI_INTERNALS__"></object>' +
          '<iframe name="__TAURI_INTERNALS__"></iframe>'
        }
      />,
    );

    expect(container.querySelector('[id="__TAURI_INTERNALS__"]')).toBeNull();
    expect(container.querySelector('[name="__TAURI_INTERNALS__"]')).toBeNull();
    expect(
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__,
    ).toBeUndefined();
    expect(
      (document as unknown as Record<string, unknown>).__TAURI_INTERNALS__,
    ).toBeUndefined();
  });

  it("keeps a quoted anchor name from shadowing window globals", () => {
    h.block_external_content = true;

    const { container } = render(
      <QuotedHtmlPreview
        html={'<a name="__TAURI_INTERNALS__">a</a><a name="__TAURI__">b</a>'}
      />,
    );

    expect(container.querySelector('a[name="__TAURI_INTERNALS__"]')).toBeNull();
    expect(container.querySelector('a[name="__TAURI__"]')).toBeNull();
    expect(
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__,
    ).toBeUndefined();
    expect(
      (window as unknown as Record<string, unknown>).__TAURI__,
    ).toBeUndefined();
  });

  it("keeps in-message links pointing at their prefixed anchor", () => {
    h.block_external_content = true;

    const { container } = render(
      <QuotedHtmlPreview
        html={'<a href="#section-1">Jump</a><a name="section-1">Anchor</a>'}
      />,
    );

    const anchor = container.querySelector(
      'a[name="aster_anchor_section-1"]',
    ) as HTMLAnchorElement | null;
    const link = container.querySelector(
      'a[href="#aster_anchor_section-1"]',
    ) as HTMLAnchorElement | null;

    expect(anchor).not.toBeNull();
    expect(link).not.toBeNull();

    const scroll_into_view = vi.fn();

    anchor!.scrollIntoView = scroll_into_view;
    h.handle_external_link.mockClear();

    act(() => {
      link!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(scroll_into_view).toHaveBeenCalledTimes(1);
    expect(h.handle_external_link).not.toHaveBeenCalled();
  });

  it("scrolls to a quoted heading that is targeted by id", () => {
    h.block_external_content = true;

    const { container } = render(
      <QuotedHtmlPreview
        html={'<a href="#news">Jump</a><h2 id="news">News</h2>'}
      />,
    );

    const heading = container.querySelector(
      '[id="aster_anchor_news"]',
    ) as HTMLElement | null;
    const link = container.querySelector(
      'a[href="#aster_anchor_news"]',
    ) as HTMLAnchorElement | null;

    expect(heading).not.toBeNull();
    expect(link).not.toBeNull();

    const scroll_into_view = vi.fn();

    heading!.scrollIntoView = scroll_into_view;
    h.handle_external_link.mockClear();

    act(() => {
      link!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(scroll_into_view).toHaveBeenCalledTimes(1);
    expect(h.handle_external_link).not.toHaveBeenCalled();
  });
});

describe("QuotedHtmlPreview containment", () => {
  it("paints quoted markup only inside its own box", () => {
    h.block_external_content = true;

    const { container } = render(<QuotedHtmlPreview html="<p>Hi</p>" />);
    const box = container.firstElementChild as HTMLElement;

    expect(box.style.contain).toBe("paint");
    expect(box.style.isolation).toBe("isolate");
    expect(box.style.overflowX).toBe("hidden");
  });

  it("keeps quoted styles from lifting content over the composer", () => {
    h.block_external_content = true;

    const { container } = render(
      <QuotedHtmlPreview
        html={
          '<div style="position:-webkit-sticky;top:-300px;z-index:99999;transform:scale(30);margin-top:-500px">Over</div>'
        }
      />,
    );
    const over = container.firstElementChild?.querySelector("div");
    const style = over?.getAttribute("style") ?? "";

    expect(over?.textContent).toBe("Over");

    expect(style).not.toMatch(/sticky|z-index|transform|-\d/i);
  });
});

describe("QuotedHtmlPreview mailto links", () => {
  it("sends a quoted mailto link through the link guard without bcc", () => {
    h.block_external_content = true;
    h.handle_external_link.mockClear();

    const { container } = render(
      <QuotedHtmlPreview
        html={
          '<a href="mailto:ada@example.com?bcc=eve@example.com&amp;subject=Hi">Mail</a>'
        }
      />,
    );

    const link = container.querySelector("a");

    expect(link).not.toBeNull();

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    act(() => {
      link!.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(h.handle_external_link).toHaveBeenCalledWith(
      "mailto:ada@example.com?subject=Hi",
      undefined,
      "Mail",
      link,
    );
  });
});
