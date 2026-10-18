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
import { describe, expect, it } from "vitest";

import { build_proxy_url, proxy_css_urls } from "./html_sanitizer_css";

const PROXY = "/api/images/v1/proxy";
const HTTP_IMAGE = "http://legacy.example.com/bg.png";
const HTTPS_IMAGE = "https://legacy.example.com/bg.png";

describe("build_proxy_url", () => {
  it("asks for the https address of a plain http source", () => {
    expect(build_proxy_url(PROXY, HTTP_IMAGE)).toBe(
      `${PROXY}?url=${encodeURIComponent(HTTPS_IMAGE)}`,
    );
  });

  it("upgrades regardless of case and surrounding spaces", () => {
    expect(build_proxy_url(PROXY, "  HTTP://legacy.example.com/bg.png ")).toBe(
      `${PROXY}?url=${encodeURIComponent(HTTPS_IMAGE)}`,
    );
  });

  it("leaves https sources unchanged", () => {
    expect(build_proxy_url(PROXY, HTTPS_IMAGE)).toBe(
      `${PROXY}?url=${encodeURIComponent(HTTPS_IMAGE)}`,
    );
  });

  it("does not treat a path containing http:// as plain http", () => {
    const target = "https://legacy.example.com/r?to=http://other.example";

    expect(build_proxy_url(PROXY, target)).toBe(
      `${PROXY}?url=${encodeURIComponent(target)}`,
    );
  });
});

describe("proxy_css_urls with plain http sources", () => {
  it("proxies css images through their https address", () => {
    const css = `.a { background: url("${HTTP_IMAGE}"); }`;

    expect(proxy_css_urls(css, PROXY)).toContain(
      `${PROXY}?url=${encodeURIComponent(HTTPS_IMAGE)}`,
    );
  });

  it("proxies font faces through their https address", () => {
    const css = `@font-face { font-family: X; src: url("http://legacy.example.com/x.woff2"); }`;

    expect(proxy_css_urls(css, PROXY)).toContain(
      `/api/content/v1/proxy?url=${encodeURIComponent("https://legacy.example.com/x.woff2")}&content_type=font`,
    );
  });
});
