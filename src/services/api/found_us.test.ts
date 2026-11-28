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
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  FOUND_US_SOURCES,
  clean_found_us_detail,
  count_chars,
  finish_found_us,
  get_found_us_status,
  limit_chars,
  snooze_found_us,
} from "./found_us";
import { api_client } from "./client";

vi.mock("./client", () => ({
  api_client: { get: vi.fn(), post: vi.fn() },
}));

const mocked_get = vi.mocked(api_client.get);
const mocked_post = vi.mocked(api_client.post);

const code = (...points: number[]) => String.fromCodePoint(...points);

describe("found_us helpers", () => {
  it("lists every source once and ends with other", () => {
    expect(new Set(FOUND_US_SOURCES).size).toBe(FOUND_US_SOURCES.length);
    expect(FOUND_US_SOURCES[FOUND_US_SOURCES.length - 1]).toBe("other");
  });

  it("counts code points, not UTF-16 units", () => {
    expect(count_chars(code(0x1f600, 0x1f600))).toBe(2);
    expect(count_chars("")).toBe(0);
  });

  it("limits by code point without splitting a surrogate pair", () => {
    const text = code(0x1f600).repeat(5);
    const limited = limit_chars(text, 3);

    expect(count_chars(limited)).toBe(3);
    expect(limited).toBe(code(0x1f600).repeat(3));
    expect(limit_chars("abc", 10)).toBe("abc");
  });

  it("collapses whitespace and trims", () => {
    expect(clean_found_us_detail("  a podcast \n\t about   privacy ")).toBe(
      "a podcast about privacy",
    );
    expect(clean_found_us_detail(code(0xa0, 0x3000) + "x" + code(0x85, 0x2028))).toBe(
      "x",
    );
  });

  it("removes control, format, surrogate, and private-use characters", () => {
    const hidden = [
      0x0, 0x7, 0x1b, 0x7f, 0x9f, 0xad, 0x200b, 0x200d, 0x200e, 0x202a,
      0x202e, 0x2060, 0x2066, 0x2069, 0xfeff, 0xe000, 0xd800,
    ];

    for (const point of hidden) {
      expect(clean_found_us_detail("a" + String.fromCharCode(point) + "b")).toBe(
        "ab",
      );
    }
  });

  it("returns an empty string for hidden-only input", () => {
    expect(clean_found_us_detail(code(0x200b, 0x20, 0xfeff, 0x9))).toBe("");
  });

  it("keeps ordinary letters from many scripts", () => {
    const text = "Un blog fran" + code(0xe7) + "ais, " + code(0x65e5, 0x672c);

    expect(clean_found_us_detail(text)).toBe(text);
  });
});

describe("found_us api calls", () => {
  beforeEach(() => {
    mocked_get.mockReset();
    mocked_post.mockReset();
    mocked_post.mockResolvedValue({ data: { ok: true } });
  });

  it("reads status from the core endpoint", async () => {
    mocked_get.mockResolvedValue({ data: { eligible: true } });
    await get_found_us_status();
    expect(mocked_get).toHaveBeenCalledWith("/core/v1/found-us");
  });

  it("sends an empty body for a skip", async () => {
    await finish_found_us(null);
    expect(mocked_post).toHaveBeenCalledWith("/core/v1/found-us/finish", {});
  });

  it("sends only the source for a listed option", async () => {
    await finish_found_us({ source: "reddit", detail: "ignored" });
    expect(mocked_post).toHaveBeenCalledWith("/core/v1/found-us/finish", {
      source: "reddit",
    });
  });

  it("sends the detail only with other", async () => {
    await finish_found_us({ source: "other", detail: "a podcast" });
    expect(mocked_post).toHaveBeenCalledWith("/core/v1/found-us/finish", {
      source: "other",
      detail: "a podcast",
    });
  });

  it("snoozes with an empty body", async () => {
    await snooze_found_us();
    expect(mocked_post).toHaveBeenCalledWith("/core/v1/found-us/later", {});
  });
});
