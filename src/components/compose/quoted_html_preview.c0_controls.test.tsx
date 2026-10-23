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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  bypass_sanitizer: false,
  lockdown: false,
}));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => h.lockdown,
}));

vi.mock("@/lib/image_proxy", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy")>()),
  get_image_proxy_url: () => "https://app.example/api/images/v1/proxy",
}));

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({ handle_external_link: () => undefined }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences_optional: () => null,
}));

vi.mock("@/lib/html_sanitizer", async (import_original) => {
  const actual = await import_original<typeof import("@/lib/html_sanitizer")>();

  return {
    ...actual,
    sanitize_html: (
      html: string,
      options: Parameters<typeof actual.sanitize_html>[1],
    ) =>
      h.bypass_sanitizer
        ? { ...actual.sanitize_html("", options), html }
        : actual.sanitize_html(html, options),
  };
});

import { QuotedHtmlPreview } from "./quoted_html_preview";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const REMOTE = "https://evil.example/px?id=v";
const PROXIED = `https://app.example/api/images/v1/proxy?url=${encodeURIComponent(REMOTE)}`;

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
  h.bypass_sanitizer = false;
  h.lockdown = false;
});

function render(html: string): HTMLElement {
  act(() => {
    root.render(<QuotedHtmlPreview html={html} />);
  });

  return container;
}

function direct_sources(element: HTMLElement): string[] {
  const values: string[] = [];

  element.querySelectorAll("*").forEach((node) => {
    for (const name of ["src", "srcset", "background", "poster", "style"]) {
      const value = node.getAttribute(name);

      if (value !== null) values.push(value.split(PROXIED).join(""));
    }
  });

  return values;
}

describe("QuotedHtmlPreview", () => {
  it("proxies the reported C0 prefixed image", () => {
    const rendered = render(`<p>Quote</p><img src="&#1;${REMOTE}" alt="pic">`);

    expect(rendered.querySelector("img")?.getAttribute("src")).toBe(PROXIED);
  });

  it("loads nothing from the reported payload in lockdown", () => {
    h.lockdown = true;

    const rendered = render(
      `<p>Quote</p><img src="&#31;${REMOTE}" srcset="&#1;${REMOTE} 2x" alt="pic">` +
        `<table><tr><td background="&#1;${REMOTE}">x</td></tr></table>`,
    );

    for (const value of direct_sources(rendered)) {
      expect(value).not.toContain("evil.example");
    }
    expect(
      rendered.querySelector("img")?.getAttribute("src") ?? "",
    ).not.toContain("proxy?url=");
  });

  it("drops remote sources even when classification is bypassed", () => {
    h.bypass_sanitizer = true;

    const rendered = render(
      `<img src="\u0001${REMOTE}" alt="a">` +
        `<img src="data:image/png;base64,iVBORw0KGgo=" srcset="${REMOTE} 2x" alt="b">` +
        `<table><tr><td background="//evil.example/bg.png">x</td></tr></table>` +
        `<div style="background:url('\u0001${REMOTE}')">y</div>` +
        `<img src="${PROXIED}" alt="c">`,
    );

    for (const value of direct_sources(rendered)) {
      expect(value).not.toContain("evil.example");
    }
    expect(rendered.querySelector('img[alt="b"]')?.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(rendered.querySelector('img[alt="c"]')?.getAttribute("src")).toBe(
      PROXIED,
    );
  });
});
