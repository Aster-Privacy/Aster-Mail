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

import {
  safe_http_url,
  safe_http_url_from_input,
} from "@/services/calendar/safe_url";

describe("safe_http_url", () => {
  it("keeps http and https urls", () => {
    expect(safe_http_url("https://meet.example.com/room")).toBe(
      "https://meet.example.com/room",
    );
    expect(safe_http_url("http://meet.example.com/room")).toBe(
      "http://meet.example.com/room",
    );
  });

  it("rejects script and data schemes", () => {
    expect(safe_http_url("javascript:alert(1)")).toBeNull();
    expect(safe_http_url("JavaScript:alert(1)")).toBeNull();
    expect(safe_http_url("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safe_http_url("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects control characters used to smuggle a scheme", () => {
    expect(safe_http_url("java\nscript:alert(1)")).toBeNull();
    expect(safe_http_url("\u0000https://example.com")).toBeNull();
  });

  it("rejects empty, oversized and non string values", () => {
    expect(safe_http_url("")).toBeNull();
    expect(safe_http_url("   ")).toBeNull();
    expect(safe_http_url(null)).toBeNull();
    expect(safe_http_url(undefined)).toBeNull();
    expect(safe_http_url(`https://example.com/${"a".repeat(3000)}`)).toBeNull();
  });
});

describe("safe_http_url_from_input", () => {
  it("adds https to a bare host", () => {
    expect(safe_http_url_from_input("meet.example.com/room")).toBe(
      "https://meet.example.com/room",
    );
  });

  it("returns an empty string for a hostile scheme", () => {
    expect(safe_http_url_from_input("javascript:alert(1)")).toBe("");
    expect(safe_http_url_from_input("data:text/html,x")).toBe("");
  });

  it("returns an empty string for blank input", () => {
    expect(safe_http_url_from_input("  ")).toBe("");
  });
});
