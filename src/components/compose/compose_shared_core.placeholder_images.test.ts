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

import { extract_inline_images } from "./compose_shared_core";

const GIF_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_2X2 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8DwnwEJMCJLAgA1BgP9qZtCBgAAAABJRU5ErkJggg==";

describe("extract_inline_images with quoted placeholder pixels", () => {
  it("never turns quoted placeholder pixels into attachments", () => {
    const html = `<p>Thanks</p><blockquote class="aster_quote_body"><p>Screens:</p><img src="${GIF_PLACEHOLDER}" data-filename="image.png"><img src="${GIF_PLACEHOLDER}" data-filename="image.png"></blockquote>`;
    const { processed_html, images } = extract_inline_images(html);

    expect(images).toHaveLength(0);
    expect(processed_html).not.toContain("<img");
    expect(processed_html).toContain("Screens:");
  });

  it("still extracts a real inline image next to a placeholder", () => {
    const html = `<p><img src="${PNG_2X2}" data-filename="chart.png"></p><blockquote><img src="${GIF_PLACEHOLDER}"></blockquote>`;
    const { processed_html, images } = extract_inline_images(html);

    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe("chart.png");
    expect(images[0].mime_type).toBe("image/png");
    expect(processed_html).toContain(`cid:${images[0].cid}`);
    expect(processed_html.match(/<img/g)).toHaveLength(1);
  });

  it("drops tiny images only inside quotes", () => {
    const html = `<p><img src="${PNG_1X1}" data-filename="dot.png"></p><blockquote><img src="${PNG_1X1}"></blockquote>`;
    const { processed_html, images } = extract_inline_images(html);

    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe("dot.png");
    expect(processed_html.match(/<img/g)).toHaveLength(1);
  });

  it("drops the placeholder pixel outside a quote too", () => {
    const { processed_html, images } = extract_inline_images(
      `<p>Hi</p><img src="${GIF_PLACEHOLDER}">`,
    );

    expect(images).toHaveLength(0);
    expect(processed_html).not.toContain("<img");
  });
});
