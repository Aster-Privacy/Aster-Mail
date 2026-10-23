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
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => "https://app.astermail.org/api/images/v1/proxy",
}));

import {
  get_original_image_source,
  proxy_compose_image_sources,
  restore_compose_image_sources,
} from "@/lib/compose_image_sources";
import {
  apply_compose_paste_dom_rules,
  sanitize_compose_paste,
} from "@/lib/html_sanitizer_compose";

const REMOTE = "https://evil.example/px?id=v";
const PROXY = "https://app.astermail.org/api/images/v1/proxy";

function img_src(html: string): string {
  return (
    new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("img")
      ?.getAttribute("src") ?? ""
  );
}

describe("compose image helpers with C0 control prefixes", () => {
  it.each([
    ["U+0001 entity", "&#1;"],
    ["U+001F entity", "&#31;"],
    ["mixed", "&#1; &#9;&#31; "],
  ])("proxies a pasted %s prefixed image", (_name, prefix) => {
    const html = proxy_compose_image_sources(
      sanitize_compose_paste(`<p>Hi</p><img src="${prefix}${REMOTE}&#2;">`),
    );
    const src = img_src(html);

    expect(src.startsWith(`${PROXY}?url=`)).toBe(true);
    expect(get_original_image_source(src)).toBe(REMOTE);
  });

  it("proxies a raw control prefixed source in serialized markup", () => {
    const src = img_src(
      proxy_compose_image_sources(`<img src="\u0001${REMOTE}\u001f">`),
    );

    expect(src).toBe(`${PROXY}?url=${encodeURIComponent(REMOTE)}`);
  });

  it("proxies scheme-relative sources over https", () => {
    const src = img_src(
      proxy_compose_image_sources(`<img src="//evil.example/px?id=v">`),
    );

    expect(get_original_image_source(src)).toBe(REMOTE);
  });

  it("restores the normalized original before sending", () => {
    const proxied = proxy_compose_image_sources(`<img src="\u0001${REMOTE}">`);

    expect(img_src(restore_compose_image_sources(proxied))).toBe(REMOTE);
  });

  it("reads a proxied original that carries control characters", () => {
    expect(
      get_original_image_source(
        `\u0001${PROXY}?url=${encodeURIComponent(`\u0001${REMOTE}`)}`,
      ),
    ).toBe(REMOTE);
  });

  it("drops a control prefixed svg data image on paste", () => {
    const html = apply_compose_paste_dom_rules(
      `<p>x</p><img src="\u0001data:image/svg+xml;base64,PHN2Zz4=">`,
    );

    expect(html).not.toContain("<img");
  });

  it("keeps a control prefixed raster data image and stores it normalized", () => {
    const html = apply_compose_paste_dom_rules(
      `<img src="\u0001data:image/png;base64,iVBORw0KGgo=">`,
    );

    expect(img_src(html)).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("removes a control prefixed javascript link", () => {
    const html = apply_compose_paste_dom_rules(
      `<a href="\u0001javascript:alert(1)">x</a>`,
    );

    expect(html).not.toContain("href");
  });
});
