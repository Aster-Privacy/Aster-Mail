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
  detect_unsubscribe_info,
  get_manual_unsubscribe_url,
} from "@/utils/unsubscribe_detector";

const ONE_CLICK_HEADERS = {
  list_unsubscribe: "<https://sender.example.com/oc?t=abc>",
  list_unsubscribe_post: "List-Unsubscribe=One-Click",
};

describe("one-click unsubscribe endpoints are never opened in a browser", () => {
  it("never offers the post-only endpoint as a page to open", () => {
    const info = detect_unsubscribe_info(
      undefined,
      undefined,
      ONE_CLICK_HEADERS,
    );

    expect(info.method).toBe("one-click");
    expect(info.unsubscribe_link).toBe("https://sender.example.com/oc?t=abc");
    expect(get_manual_unsubscribe_url(info)).toBe("");
  });

  it("offers the body page instead when the email carries one", () => {
    const html =
      '<a href="https://sender.example.com/prefs?id=9">Unsubscribe</a>';
    const info = detect_unsubscribe_info(html, undefined, ONE_CLICK_HEADERS);

    expect(info.method).toBe("one-click");
    expect(info.unsubscribe_page_url).toBe(
      "https://sender.example.com/prefs?id=9",
    );
    expect(get_manual_unsubscribe_url(info)).toBe(
      "https://sender.example.com/prefs?id=9",
    );
  });

  it("falls back to the header mailto rather than the post-only endpoint", () => {
    const info = detect_unsubscribe_info(undefined, undefined, {
      list_unsubscribe:
        "<https://sender.example.com/oc>, <mailto:stop@sender.example.com>",
      list_unsubscribe_post: "List-Unsubscribe=One-Click",
    });

    expect(get_manual_unsubscribe_url(info)).toBe(
      "mailto:stop@sender.example.com",
    );
  });

  it("still opens a plain list-unsubscribe page that has no post header", () => {
    const info = detect_unsubscribe_info(undefined, undefined, {
      list_unsubscribe: "<https://sender.example.com/u/42>",
    });

    expect(info.method).toBe("link");
    expect(get_manual_unsubscribe_url(info)).toBe(
      "https://sender.example.com/u/42",
    );
  });
});

describe("body unsubscribe links", () => {
  it("decodes html entities so query parameters survive", () => {
    const html =
      '<a href="https://sender.example.com/unsubscribe?id=7&amp;tok=xy&amp;lang=en">Unsubscribe</a>';
    const info = detect_unsubscribe_info(html);

    expect(info.unsubscribe_link).toBe(
      "https://sender.example.com/unsubscribe?id=7&tok=xy&lang=en",
    );
    expect(get_manual_unsubscribe_url(info)).toBe(
      "https://sender.example.com/unsubscribe?id=7&tok=xy&lang=en",
    );
  });

  it("ignores relative and non-http hrefs", () => {
    const info = detect_unsubscribe_info(
      '<a href="/unsubscribe">Unsubscribe</a>',
    );

    expect(info.has_unsubscribe).toBe(false);
    expect(get_manual_unsubscribe_url(info)).toBe("");
  });
});
