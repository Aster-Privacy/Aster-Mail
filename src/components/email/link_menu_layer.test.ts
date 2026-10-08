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

import { link_menu_host } from "./link_menu_layer";

describe("link_menu_host", () => {
  it("returns the host for web links", () => {
    expect(link_menu_host("https://www.example.com/path?q=1")).toBe(
      "www.example.com",
    );
    expect(link_menu_host("http://example.org")).toBe("example.org");
  });

  it("ignores links that are not web pages", () => {
    expect(link_menu_host("mailto:someone@example.com")).toBeNull();
    expect(link_menu_host("javascript:alert(1)")).toBeNull();
    expect(link_menu_host("not a url")).toBeNull();
  });
});
