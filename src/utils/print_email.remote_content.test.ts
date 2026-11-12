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
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => undefined,
}));

import { format_body, print_granted_types } from "./print_email";

import { track_active_grants } from "@/lib/remote_content_grants";

const REMOTE_HTML = [
  "<div>",
  "<p>hello</p>",
  '<img src="https://remote.example/a.png" width="20" height="10">',
  '<img srcset="https://remote.example/b.png 1x, //remote.example/c.png 2x">',
  '<table background="https://remote.example/bg.png"><tr><td>cell</td></tr></table>',
  '<div style="background-image: url(https://remote.example/d.png)">box</div>',
  "</div>",
].join("");

function remote_loads(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const found: string[] = [];

  doc.body.querySelectorAll("*").forEach((el) => {
    for (const name of ["src", "srcset", "background", "poster"]) {
      const value = el.getAttribute(name) ?? "";

      if (/(https?:)?\/\/remote\.example/i.test(value)) found.push(value);
    }

    const style = el.getAttribute("style") ?? "";

    if (/remote\.example/i.test(style)) found.push(style);
  });

  return found;
}

let untrack: (() => void) | null = null;

function grant(message_id: string, types: string[]): void {
  untrack = track_active_grants(new Map([[message_id, new Set(types)]]));
}

afterEach(() => {
  untrack?.();
  untrack = null;
});

describe("print remote content", () => {
  it("loads nothing remote when the setting is never", () => {
    const html = format_body(REMOTE_HTML, "never");

    expect(remote_loads(html)).toEqual([]);
    expect(html).toContain("hello");
  });

  it("ignores a message grant when the setting is never", () => {
    grant("m1", ["image", "tracking_pixel", "font", "css"]);

    const html = format_body(
      REMOTE_HTML,
      "never",
      undefined,
      print_granted_types("m1"),
    );

    expect(remote_loads(html)).toEqual([]);
  });

  it("loads nothing remote when asking and the message has no grant", () => {
    expect(remote_loads(format_body(REMOTE_HTML, "ask"))).toEqual([]);
  });

  it("loads images for the message the reader allowed", () => {
    grant("m1", ["image"]);

    const html = format_body(
      REMOTE_HTML,
      "ask",
      undefined,
      print_granted_types("m1"),
    );

    expect(html).toContain("https://remote.example/a.png");
  });

  it("does not carry a grant over to another message", () => {
    grant("m1", ["image"]);

    const html = format_body(
      REMOTE_HTML,
      "ask",
      undefined,
      print_granted_types("m2"),
    );

    expect(remote_loads(html)).toEqual([]);
  });

  it("forgets a grant once its viewer is gone", () => {
    grant("m1", ["image"]);
    untrack?.();
    untrack = null;

    expect(print_granted_types("m1").size).toBe(0);
    expect(print_granted_types(undefined).size).toBe(0);
  });
});
