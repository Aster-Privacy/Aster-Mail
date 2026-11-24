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
  detect_unsubscribe_info,
  get_manual_unsubscribe_url,
} from "@/utils/unsubscribe_detector";

const POST = "List-Unsubscribe=One-Click";

function detect(list_unsubscribe: string, list_unsubscribe_post?: string) {
  return detect_unsubscribe_info(undefined, undefined, {
    list_unsubscribe,
    list_unsubscribe_post,
  });
}

describe("list unsubscribe headers from common sending platforms", () => {
  it("reads a header that was folded across lines", () => {
    const info = detect(
      "<mailto:unsub-a1@bounce.esp.example?subject=unsubscribe>,\r\n <https://click.esp.example/u/a1?t=z>",
      POST,
    );

    expect(info.method).toBe("one-click");
    expect(info.unsubscribe_link).toBe("https://click.esp.example/u/a1?t=z");
    expect(info.unsubscribe_mailto).toBe(
      "unsub-a1@bounce.esp.example?subject=unsubscribe",
    );
  });

  it("reads a folded header after the server joined the lines", () => {
    const info = detect(
      "<https://list.esp.example/oc/b2>, <mailto:leave-b2@list.esp.example>",
      POST,
    );

    expect(info.method).toBe("one-click");
    expect(info.unsubscribe_link).toBe("https://list.esp.example/oc/b2");
  });

  it("reads entries listed without a space after the comma", () => {
    const info = detect(
      "<https://e.esp.example/u?id=1&h=2>,<mailto:u@e.esp.example>",
      POST,
    );

    expect(info.method).toBe("one-click");
    expect(info.unsubscribe_link).toBe("https://e.esp.example/u?id=1&h=2");
  });

  it("keeps the mailto address and its query when the header lists only mailto", () => {
    const info = detect("<mailto:stop@news.example?subject=stop>");

    expect(info.method).toBe("mailto");
    expect(info.unsubscribe_mailto).toBe("stop@news.example?subject=stop");
  });

  it("opens the page when the header has https but no post header", () => {
    const info = detect("<https://news.example/prefs>");

    expect(info.method).toBe("link");
    expect(get_manual_unsubscribe_url(info)).toBe("https://news.example/prefs");
  });

  it("accepts a post header value with stray whitespace", () => {
    expect(
      detect("<https://news.example/oc>", "  List-Unsubscribe=One-Click\t")
        .method,
    ).toBe("one-click");
  });
});
