//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import { build_proxied_content_csp } from "./email_content_csp";

describe("build_proxied_content_csp", () => {
  it("names the app origin next to self for a relative proxy on the web", () => {
    const csp = build_proxied_content_csp(
      "/api/images/v1/proxy",
      "https://app.astermail.org/",
    );

    expect(csp).toContain(
      "img-src 'self' data: blob: https://app.astermail.org;",
    );
    expect(csp).toContain("font-src 'self' data: https://app.astermail.org;");
    expect(csp).not.toMatch(/(?:img|font)-src[^;]*https?:(?:;|\s)/);
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("connect-src 'none'");
  });

  it("uses the proxy origin for native apps that use an absolute proxy", () => {
    const csp = build_proxied_content_csp(
      "https://app.astermail.org/api/images/v1/proxy",
      "https://app.astermail.org/",
    );

    expect(csp).toContain(
      "img-src 'self' data: blob: https://app.astermail.org;",
    );
  });

  it("keeps a self hosted origin when the app runs elsewhere", () => {
    const csp = build_proxied_content_csp(
      "/api/images/v1/proxy",
      "http://127.0.0.1:5173/",
    );

    expect(csp).toContain("img-src 'self' data: blob: http://127.0.0.1:5173;");
  });

  it("falls back to self and embedded data for an unusable base", () => {
    expect(
      build_proxied_content_csp("/api/images/v1/proxy", "about:blank"),
    ).toContain("img-src 'self' data: blob:;");
  });

  it("limits the base url to the origin the viewer sets", () => {
    const csp = build_proxied_content_csp(
      "/api/images/v1/proxy",
      "https://app.astermail.org/",
    );

    expect(csp).toContain("base-uri https://app.astermail.org;");
    expect(csp).not.toMatch(/base-uri[^;]*https?:(?:;|\s)/);
  });

  it("limits the base url to self for an unusable base", () => {
    expect(
      build_proxied_content_csp("/api/images/v1/proxy", "about:blank"),
    ).toContain("base-uri 'self';");
  });
});
