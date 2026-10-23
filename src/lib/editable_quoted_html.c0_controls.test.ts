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
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  bypass_sanitizer: false,
}));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy")>()),
  get_image_proxy_url: () => "https://app.example/api/images/v1/proxy",
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

vi.mock("@/lib/compose_image_sources", async (import_original) => {
  const actual =
    await import_original<typeof import("@/lib/compose_image_sources")>();

  return {
    ...actual,
    proxy_compose_image_sources: (html: string) =>
      h.bypass_sanitizer ? html : actual.proxy_compose_image_sources(html),
  };
});

import {
  build_editable_quoted_fragment,
  read_editable_quoted_html,
} from "@/lib/editable_quoted_html";

const REMOTE = "https://evil.example/px?id=v";
const REPORTED = `<p>Body</p><img src="&#1;${REMOTE}" alt="pic">`;

function mount(html: string, block_remote_images = false): HTMLDivElement {
  const container = document.createElement("div");

  container.replaceChildren(
    build_editable_quoted_fragment(html, { block_remote_images }),
  );

  return container;
}

function live_sources(container: HTMLElement): string[] {
  const values: string[] = [];

  container.querySelectorAll("*").forEach((element) => {
    for (const name of ["src", "srcset", "background", "poster", "style"]) {
      const value = element.getAttribute(name);

      if (value !== null) values.push(value);
    }
  });
  container.querySelectorAll("style").forEach((style) => {
    values.push(style.textContent ?? "");
  });

  return values;
}

function expect_no_direct_fetch(container: HTMLElement): void {
  for (const value of live_sources(container)) {
    const direct = value.replace(
      /https:\/\/app\.example\/api\/images\/v1\/proxy\?url=[^\s"')]*/g,
      "",
    );

    expect(direct).not.toContain("evil.example");
  }
}

afterEach(() => {
  h.bypass_sanitizer = false;
});

describe("forward editor with the reported C0 payload", () => {
  it("loads the image through the proxy when images are allowed", () => {
    const container = mount(REPORTED);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `https://app.example/api/images/v1/proxy?url=${encodeURIComponent(REMOTE)}`,
    );
    expect_no_direct_fetch(container);
  });

  it("loads nothing when images are blocked", () => {
    const container = mount(REPORTED, true);

    expect(container.querySelector("img")?.getAttribute("src")).toBeNull();
    expect_no_direct_fetch(container);
  });

  it("sends the original address", () => {
    const sent = read_editable_quoted_html(mount(REPORTED));

    expect(sent).toContain(REMOTE.replace("&", "&amp;"));
    expect(sent).not.toContain("/api/images/v1/proxy");
  });
});

describe("forward editor when classification is bypassed", () => {
  const bypass_input =
    `<p>Body</p><img src="\u0001${REMOTE}" alt="a">` +
    `<img src="data:image/png;base64,iVBORw0KGgo=" srcset="\u001f${REMOTE} 2x" alt="b">` +
    `<table><tr><td background="//evil.example/bg.png">x</td></tr></table>` +
    `<div style="background:url('\u0001${REMOTE}')">y</div>` +
    `<style>.a { background: url("${REMOTE}"); }</style>` +
    `<img src="cid:part1" alt="c">`;

  it("parks every source that does not resolve to the app or the proxy", () => {
    h.bypass_sanitizer = true;

    const container = mount(bypass_input);

    expect_no_direct_fetch(container);
    expect(container.innerHTML).toContain("data-aster-parked-src");
    expect(
      container.querySelector('img[alt="b"]')?.hasAttribute("srcset"),
    ).toBe(false);
    expect(container.innerHTML).toContain("data-aster-parked-background");
    expect(container.innerHTML).toContain("data-aster-parked-style");
    expect(container.innerHTML).toContain("data-aster-parked-css");
    expect(container.querySelector('img[alt="b"]')?.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
  });

  it("restores the parked sources when the forward is sent", () => {
    h.bypass_sanitizer = true;

    const sent = read_editable_quoted_html(mount(bypass_input));

    expect(sent).not.toContain("data-aster-parked");
    expect(sent).toContain("evil.example/bg.png");
    expect(sent).toContain("cid:part1");
  });
});
