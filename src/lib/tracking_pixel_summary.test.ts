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
import { describe, it, expect } from "vitest";

import {
  summarize_tracking_pixels,
  tracking_pixel_domain,
} from "@/lib/tracking_pixel_summary";

describe("summarize_tracking_pixels", () => {
  it("counts tracking pixels apart from images and groups them by hostname", () => {
    const summary = summarize_tracking_pixels({
      blocked_items: [
        { url: "https://cdn.shop.example/hero.jpg", type: "image" },
        {
          url: "https://open.mailmetrics.example/o/1.gif",
          type: "tracking_pixel",
        },
        { url: "https://t.beacon.example/open?id=9", type: "tracking_pixel" },
        {
          url: "https://OPEN.MailMetrics.example./o/2.gif?u=x",
          type: "tracking_pixel",
        },
        { url: "https://fonts.shop.example/a.woff2", type: "font" },
      ],
    });

    expect(summary).toEqual({
      count: 3,
      domains: [
        { domain: "open.mailmetrics.example", count: 2 },
        { domain: "t.beacon.example", count: 1 },
      ],
    });
  });

  it("keeps counting pixels whose address has no hostname", () => {
    const summary = summarize_tracking_pixels({
      blocked_items: [
        { url: "/relative/pixel.gif", type: "tracking_pixel" },
        { url: "//track.example/p.gif", type: "tracking_pixel" },
      ],
    });

    expect(summary.count).toBe(2);
    expect(summary.domains).toEqual([{ domain: "track.example", count: 1 }]);
  });

  it("returns an empty summary without a report", () => {
    expect(summarize_tracking_pixels(null)).toEqual({ count: 0, domains: [] });
  });

  it("reduces addresses to the hostname only", () => {
    expect(
      tracking_pixel_domain("https://user:pw@px.example:8443/a/b.gif?id=1#x"),
    ).toBe("px.example");
    expect(tracking_pixel_domain("not a url")).toBeNull();
  });
});
