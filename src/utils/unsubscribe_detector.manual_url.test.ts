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
  get_manual_unsubscribe_url,
  detect_unsubscribe_info,
} from "@/utils/unsubscribe_detector";

describe("get_manual_unsubscribe_url", () => {
  it("prefers an http link when both are present", () => {
    expect(
      get_manual_unsubscribe_url({
        unsubscribe_link: "https://list.example.com/u/1",
        unsubscribe_mailto: "unsub@list.example.com",
      }),
    ).toBe("https://list.example.com/u/1");
  });

  it("adds the scheme to a bare mailto address", () => {
    expect(
      get_manual_unsubscribe_url({
        unsubscribe_mailto: "unsub-12345@list.example.com",
      }),
    ).toBe("mailto:unsub-12345@list.example.com");
  });

  it("keeps an address that already carries the scheme", () => {
    expect(
      get_manual_unsubscribe_url({
        unsubscribe_mailto: "mailto:unsub@list.example.com?subject=stop",
      }),
    ).toBe("mailto:unsub@list.example.com?subject=stop");
  });

  it("returns an empty string when there is nothing to open", () => {
    expect(get_manual_unsubscribe_url({})).toBe("");
    expect(get_manual_unsubscribe_url({ unsubscribe_mailto: "   " })).toBe("");
    expect(
      get_manual_unsubscribe_url({ unsubscribe_mailto: "not-an-addr" }),
    ).toBe("");
  });

  it("extracts an http url from a raw list-unsubscribe header", () => {
    expect(
      get_manual_unsubscribe_url({
        list_unsubscribe_header:
          "<mailto:unsub@list.example.com>, <https://list.example.com/u/9>",
      }),
    ).toBe("https://list.example.com/u/9");
  });

  it("falls back to the header mailto when the header has no http url", () => {
    expect(
      get_manual_unsubscribe_url({
        list_unsubscribe_header: "<mailto:unsub@list.example.com>",
      }),
    ).toBe("mailto:unsub@list.example.com");
  });

  it("returns an empty string for a header with no usable target", () => {
    expect(get_manual_unsubscribe_url({ list_unsubscribe_header: "<>" })).toBe(
      "",
    );
  });

  it("resolves a header-only mailto list into an openable url", () => {
    const info = detect_unsubscribe_info(undefined, undefined, {
      list_unsubscribe: "<mailto:unsub@list.example.com>",
    });

    expect(info.method).toBe("mailto");
    expect(get_manual_unsubscribe_url(info)).toBe(
      "mailto:unsub@list.example.com",
    );
  });
});
