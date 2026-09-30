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
import { describe, it, expect } from "vitest";

import { normalize_link_url } from "@/utils/link_url";

describe("normalize_link_url", () => {
  it("keeps an explicit https url unchanged", () => {
    expect(normalize_link_url("https://astermail.org/help")).toBe(
      "https://astermail.org/help",
    );
  });

  it("keeps an explicit http url unchanged", () => {
    expect(normalize_link_url("http://example.com")).toBe("http://example.com");
  });

  it("adds https to a schemeless domain", () => {
    expect(normalize_link_url("astermail.org")).toBe("https://astermail.org");
  });

  it("adds https to a schemeless domain with a path", () => {
    expect(normalize_link_url("  www.example.com/a/b  ")).toBe(
      "https://www.example.com/a/b",
    );
  });

  it("turns a bare address into a mailto link", () => {
    expect(normalize_link_url("hello@astermail.org")).toBe(
      "mailto:hello@astermail.org",
    );
  });

  it("keeps an explicit mailto link", () => {
    expect(normalize_link_url("mailto:hello@astermail.org")).toBe(
      "mailto:hello@astermail.org",
    );
  });

  it("rejects script and data schemes", () => {
    expect(normalize_link_url("javascript:alert(1)")).toBeNull();
    expect(normalize_link_url("JavaScript:alert(1)")).toBeNull();
    expect(normalize_link_url("data:text/html,<h1>x</h1>")).toBeNull();
    expect(normalize_link_url("file:///etc/passwd")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normalize_link_url("")).toBeNull();
    expect(normalize_link_url("   ")).toBeNull();
  });
});
