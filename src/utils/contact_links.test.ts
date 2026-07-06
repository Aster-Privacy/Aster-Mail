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

import { build_contact_social_url } from "./contact_links";

describe("build_contact_social_url website", () => {
  it("keeps http and https urls", () => {
    expect(
      build_contact_social_url("website", "https://example.com/a?b=c"),
    ).toBe("https://example.com/a?b=c");
    expect(build_contact_social_url("website", "http://example.com")).toBe(
      "http://example.com/",
    );
  });

  it("prepends https to bare domains", () => {
    expect(build_contact_social_url("website", "example.com")).toBe(
      "https://example.com/",
    );
    expect(build_contact_social_url("website", "  example.com/path  ")).toBe(
      "https://example.com/path",
    );
  });

  it("rejects non-web schemes", () => {
    expect(
      build_contact_social_url("website", "javascript:alert(1)"),
    ).toBeNull();
    expect(build_contact_social_url("website", "data:text/html,x")).toBeNull();
    expect(build_contact_social_url("website", "ftp://example.com")).toBeNull();
    expect(
      build_contact_social_url("website", "file:///etc/passwd"),
    ).toBeNull();
    expect(build_contact_social_url("website", "vbscript:x")).toBeNull();
  });

  it("rejects empty values", () => {
    expect(build_contact_social_url("website", "")).toBeNull();
    expect(build_contact_social_url("website", "   ")).toBeNull();
  });
});

describe("build_contact_social_url social handles", () => {
  it("keeps allowlisted host urls", () => {
    expect(
      build_contact_social_url("linkedin", "https://linkedin.com/in/someone"),
    ).toBe("https://linkedin.com/in/someone");
    expect(
      build_contact_social_url("linkedin", "https://www.linkedin.com/in/x"),
    ).toBe("https://www.linkedin.com/in/x");
    expect(build_contact_social_url("twitter", "https://x.com/someone")).toBe(
      "https://x.com/someone",
    );
    expect(
      build_contact_social_url("twitter", "https://twitter.com/someone"),
    ).toBe("https://twitter.com/someone");
    expect(
      build_contact_social_url("github", "https://github.com/someone"),
    ).toBe("https://github.com/someone");
  });

  it("rejects full urls on other hosts instead of rewriting them", () => {
    expect(
      build_contact_social_url("linkedin", "https://evil.com/in/someone"),
    ).toBeNull();
    expect(
      build_contact_social_url("twitter", "https://fakex.com/a"),
    ).toBeNull();
    expect(
      build_contact_social_url("github", "https://github.com.evil.com/a"),
    ).toBeNull();
  });

  it("builds profile urls from bare handles", () => {
    expect(build_contact_social_url("linkedin", "someone")).toBe(
      "https://linkedin.com/in/someone",
    );
    expect(build_contact_social_url("twitter", "@someone")).toBe(
      "https://x.com/someone",
    );
    expect(build_contact_social_url("github", "someone")).toBe(
      "https://github.com/someone",
    );
  });

  it("percent-encodes handles so they cannot escape the profile path", () => {
    expect(build_contact_social_url("twitter", "a/../b")).toBe(
      "https://x.com/a%2F..%2Fb",
    );
    expect(build_contact_social_url("github", "a?b=c")).toBe(
      "https://github.com/a%3Fb%3Dc",
    );
  });

  it("rejects handle values carrying a scheme", () => {
    expect(
      build_contact_social_url("twitter", "javascript:alert(1)"),
    ).toBeNull();
    expect(build_contact_social_url("linkedin", "ftp://x")).toBeNull();
  });
});
