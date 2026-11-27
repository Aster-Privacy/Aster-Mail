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

import { apply_image_width } from "@/lib/compose_image_size";
import { extract_inline_images } from "@/components/compose/compose_shared_core";
import { sanitize_html } from "@/lib/html_sanitizer";
import {
  purify_outgoing_html,
  sanitize_compose_paste,
} from "@/lib/html_sanitizer_compose";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function resized_html(width: number): string {
  const wrapper = document.createElement("div");
  const img = document.createElement("img");

  img.setAttribute("src", PIXEL);
  img.setAttribute("style", "max-width: 100%; height: auto; display: block;");
  apply_image_width(img, width);
  wrapper.appendChild(img);

  return wrapper.innerHTML;
}

function first_image(html: string): HTMLImageElement {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const img = doc.querySelector("img");

  if (!img) throw new Error("missing image");

  return img;
}

function expect_size(img: HTMLImageElement, width: number) {
  expect(img.getAttribute("width")).toBe(String(width));
  expect(img.style.width).toBe(`${width}px`);
  expect(img.style.height).toBe("auto");
  expect(img.style.maxWidth).toBe("100%");
}

describe("resized inline image serialization", () => {
  it("keeps the size through outgoing purification", () => {
    expect_size(first_image(purify_outgoing_html(resized_html(240))), 240);
  });

  it("keeps the size when inline images become attachments", () => {
    const { processed_html, images } = extract_inline_images(
      resized_html(320),
    );
    const img = first_image(processed_html);

    expect(images.length).toBe(1);
    expect(img.getAttribute("src")?.startsWith("cid:")).toBe(true);
    expect_size(img, 320);
  });

  it("keeps the size when a draft is restored", () => {
    const restored = first_image(
      sanitize_html(resized_html(200), { external_content_mode: "always" }).html,
    );

    expect(restored.getAttribute("width")).toBe("200");
    expect(restored.style.width).toBe("200px");
  });

  it("keeps the size in reply and forward quoting", () => {
    const quoted = first_image(sanitize_compose_paste(resized_html(150)));

    expect(quoted.getAttribute("width")).toBe("150");
    expect(quoted.style.width).toBe("150px");
  });
});
