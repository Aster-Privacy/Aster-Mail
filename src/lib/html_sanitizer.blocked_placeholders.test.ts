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
import { describe, expect, it } from "vitest";

import { sanitize_html } from "./html_sanitizer";

import { pre_process_email_html } from "@/components/email/email_pre_process";

const image = "https://images.example.test/logo.png";
const proxy = "/api/images/v1/proxy";

function sanitize(source: string, mode: "ask" | "never" = "ask") {
  const { html } = sanitize_html(source, {
    external_content_mode: mode,
    image_proxy_url: proxy,
  });

  return new DOMParser().parseFromString(html, "text/html");
}

describe("blocked images preserve email layout", () => {
  it.each(["ask", "never"] as const)(
    "keeps the original image element, dimensions, alignment and responsive ratio in %s mode",
    (mode) => {
      const doc = sanitize(
        `<p>Photo</p><img src="${image}" class="hero" width="640" height="180" alt="Coastal path" style="display:block;margin:12px auto;width:100%;height:auto">`,
        mode,
      );
      const img = doc.querySelector("img")!;

      expect(doc.querySelector("span.blocked-image")).toBeNull();
      expect(img.classList.contains("hero")).toBe(true);
      expect(img.getAttribute("width")).toBe("640");
      expect(img.getAttribute("height")).toBe("180");
      expect(img.style.width).toBe("100%");
      expect(img.style.height).toBe("auto");
      expect(img.style.display).toBe("block");
      expect(img.style.margin).toBe("12px auto");
      expect(img.getAttribute("aria-label")).toBe(
        "Image blocked: Coastal path",
      );
      expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
      expect(img.getAttribute("src")).not.toContain(proxy);
    },
  );

  it("does not invent a square ratio for a width-only logo", () => {
    const doc = sanitize(
      `<p>Logo</p><img src="${image}" width="162" alt="Sample logo">`,
    );
    const img = doc.querySelector("img")!;
    const svg = decodeURIComponent(img.getAttribute("src")!.split(",")[1]);

    expect(img.style.aspectRatio).toBe("");
    expect(img.getAttribute("data-placeholder-size-known")).toBe("false");
    expect(svg).toContain('width="162" height="24"');
  });

  it("keeps tracking pixels at their declared size and identifies them accessibly", () => {
    const doc = sanitize(`<p>End</p><img src="${image}" width="1" height="1">`);
    const img = doc.querySelector("img")!;

    expect(img.getAttribute("width")).toBe("1");
    expect(img.getAttribute("height")).toBe("1");
    expect(img.getAttribute("title")).toBe("Tracking pixel blocked");
    expect(img.getAttribute("aria-label")).toBe("Tracking pixel blocked");
    expect(doc.querySelector("span")).toBeNull();
    expect(img.style.padding).toBe("");
    expect(img.style.minWidth).toBe("");
  });

  it("keeps sender alt text out of the generated SVG", () => {
    const doc = sanitize(
      `<p>Photo</p><img src="${image}" alt="&lt;script&gt;alert(1)&lt;/script&gt;">`,
    );
    const img = doc.querySelector("img")!;
    const svg = decodeURIComponent(img.getAttribute("src")!.split(",")[1]);

    expect(svg).not.toContain("script");
    expect(svg).not.toContain("alert");
    expect(doc.querySelector("script")).toBeNull();
  });

  it("loads the original image without changing its layout or leaving blocked labels", () => {
    const doc = sanitize(
      `<p>Logo</p><img src="${image}" width="162" height="32" alt="Sample logo" title="Original title" style="border:none">`,
    );
    const html = pre_process_email_html(doc.body.innerHTML, {
      forwarded_label: "Forwarded message",
      show_trimmed_label: "Show trimmed content",
      preserve_formatting: true,
      load_remote_content: true,
      proxy_base: proxy,
    });
    const img = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("img")!;

    expect(img.getAttribute("width")).toBe("162");
    expect(img.getAttribute("height")).toBe("32");
    expect(img.getAttribute("alt")).toBe("Sample logo");
    expect(img.getAttribute("title")).toBe("Original title");
    expect(img.hasAttribute("aria-label")).toBe(false);
    expect(img.hasAttribute("data-placeholder-width")).toBe(false);
    expect(img.getAttribute("src")).toBe(
      new URL(`${proxy}?url=${encodeURIComponent(image)}`, window.location.href)
        .href,
    );
    expect(img.getAttribute("style")).toContain("border");
  });
});
