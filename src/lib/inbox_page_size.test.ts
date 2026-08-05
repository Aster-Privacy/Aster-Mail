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

import {
  DEFAULT_INBOX_PAGE_SIZE,
  LOW_NETWORK_PAGE_SIZE,
  MAX_INBOX_PAGE_SIZE,
  MIN_INBOX_PAGE_SIZE,
  clamp_inbox_page_size,
  resolve_effective_page_size,
} from "./inbox_page_size";

describe("clamp_inbox_page_size", () => {
  it("falls back when the value is not a number", () => {
    expect(clamp_inbox_page_size(undefined)).toBe(DEFAULT_INBOX_PAGE_SIZE);
    expect(clamp_inbox_page_size("50")).toBe(DEFAULT_INBOX_PAGE_SIZE);
    expect(clamp_inbox_page_size(Number.NaN, 20)).toBe(20);
  });

  it("clamps to the supported range", () => {
    expect(clamp_inbox_page_size(1)).toBe(MIN_INBOX_PAGE_SIZE);
    expect(clamp_inbox_page_size(9999)).toBe(MAX_INBOX_PAGE_SIZE);
    expect(clamp_inbox_page_size(30)).toBe(30);
  });
});

describe("resolve_effective_page_size", () => {
  it("uses the preferred size when low network mode is off", () => {
    expect(resolve_effective_page_size(50, false)).toBe(50);
    expect(resolve_effective_page_size(undefined, undefined)).toBe(
      DEFAULT_INBOX_PAGE_SIZE,
    );
  });

  it("caps the size in low network mode", () => {
    expect(resolve_effective_page_size(50, true)).toBe(LOW_NETWORK_PAGE_SIZE);
    expect(resolve_effective_page_size(100, true)).toBe(LOW_NETWORK_PAGE_SIZE);
  });

  it("never raises a smaller preference in low network mode", () => {
    expect(resolve_effective_page_size(10, true)).toBe(10);
  });
});
