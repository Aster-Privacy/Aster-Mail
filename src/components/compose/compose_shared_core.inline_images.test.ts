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
import { describe, it, expect, vi } from "vitest";

import { extract_inline_images } from "./compose_shared_core";

import { purify_outgoing_html } from "@/lib/html_sanitizer_compose";

vi.mock("@/lib/html_sanitizer_compose", async (import_original) => {
  const actual =
    await import_original<typeof import("@/lib/html_sanitizer_compose")>();

  return {
    ...actual,
    purify_outgoing_html: vi.fn(actual.purify_outgoing_html),
  };
});

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function parse_body(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body;
}

describe("extract_inline_images", () => {
  it("moves pasted data images to cid attachments", () => {
    const { processed_html, images } = extract_inline_images(
      `<p>Hi</p><img src="data:image/png;base64,${PNG_B64}" data-filename="chart.png" alt="chart">`,
    );

    expect(images).toHaveLength(1);
    expect(images[0].mime_type).toBe("image/png");
    expect(images[0].filename).toBe("chart.png");
    expect(images[0].data.byteLength).toBeGreaterThan(0);

    const img = parse_body(processed_html).querySelector("img")!;

    expect(img.getAttribute("src")).toBe(`cid:${images[0].cid}`);
    expect(img.getAttribute("alt")).toBe("chart");
  });

  it("leaves the markup of a body without data images unchanged", () => {
    const html =
      '<div dir="auto" style="font-family: Arial; color: rgb(17, 17, 17);">Hello <b>there</b>, see <a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">the doc</a>.</div>' +
      '<div data-aster-signature="true" data-aster-signature-id="sig_1"><table style="border-collapse: collapse;"><tbody><tr><td style="padding: 4px;">Name</td></tr></tbody></table></div>' +
      '<div class="aster_quote"><div class="aster_quote_attr">On Monday, a@b.com wrote:</div><blockquote class="aster_quote_body" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex"><img src="cid:logo_1@example.com" alt="logo"><ul><li>one</li><li><s>two</s></li></ul></blockquote></div>';

    const { processed_html, images } = extract_inline_images(html);

    expect(images).toEqual([]);
    expect(processed_html).toBe(parse_body(html).innerHTML);
  });

  it("keeps mailto, tel and cid references", () => {
    const { processed_html } = extract_inline_images(
      '<a href="mailto:a@b.com">m</a><a href="tel:+15550100">t</a><img src="cid:x@y">',
    );
    const body = parse_body(processed_html);

    expect(body.querySelector('a[href="mailto:a@b.com"]')).not.toBeNull();
    expect(body.querySelector('a[href="tel:+15550100"]')).not.toBeNull();
    expect(body.querySelector('img[src="cid:x@y"]')).not.toBeNull();
  });

  it("parses the body only after passing it through the outgoing purifier", () => {
    const html = '<p>ok</p><img src="x" onerror="alert(1)">';

    vi.mocked(purify_outgoing_html).mockClear();
    extract_inline_images(html);

    expect(purify_outgoing_html).toHaveBeenCalledTimes(1);
    expect(purify_outgoing_html).toHaveBeenCalledWith(html);
  });

  it("does not extract svg data images", () => {
    const svg_b64 = btoa('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const { images } = extract_inline_images(
      `<img src="data:image/svg+xml;base64,${svg_b64}">`,
    );

    expect(images).toEqual([]);
  });

  it("returns an empty body for empty input", () => {
    expect(extract_inline_images("")).toEqual({
      processed_html: "",
      images: [],
    });
  });
});
