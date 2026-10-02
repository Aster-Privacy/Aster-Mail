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

import { sanitize_html, type SanitizeOptions } from "./html_sanitizer";

import { pre_process_email_html } from "@/components/email/email_pre_process";
import { pt } from "@/lib/i18n/translations/pt";
import { pt_br } from "@/lib/i18n/translations/pt-BR";

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

function svg_of(img: Element): string {
  return decodeURIComponent(img.getAttribute("src")!.split(",")[1]);
}

describe("blocked image labels", () => {
  it.each([
    ["pt", pt.common, "Imagem bloqueada", "Píxel de rastreio bloqueado"],
    [
      "pt-BR",
      pt_br.common,
      "Imagem bloqueada",
      "Pixel de rastreamento bloqueado",
    ],
  ])(
    "draws and announces the %s labels",
    (_code, common, image_label, pixel_label) => {
      const { html } = sanitize_html(
        `<img src="${image}" width="640" height="180" alt="Farol"><img src="${image}" width="1" height="1">`,
        {
          external_content_mode: "ask",
          blocked_image_labels: {
            image: common.image_blocked,
            tracking_pixel: common.tracking_pixel_blocked,
          },
        },
      );
      const [photo, pixel] = Array.from(
        new DOMParser()
          .parseFromString(html, "text/html")
          .querySelectorAll("img"),
      );

      expect(photo.getAttribute("aria-label")).toBe(`${image_label}: Farol`);
      expect(svg_of(photo)).toContain(`>${image_label}</text>`);
      expect(pixel.getAttribute("aria-label")).toBe(pixel_label);
      expect(html).not.toContain("Image blocked");
    },
  );

  it("escapes the label inside the generated SVG", () => {
    const { html } = sanitize_html(
      `<img src="${image}" width="640" height="180">`,
      {
        external_content_mode: "ask",
        blocked_image_labels: {
          image: `<script>"x"&'y'</script>`,
          tracking_pixel: "t",
        },
      },
    );
    const svg = svg_of(
      new DOMParser().parseFromString(html, "text/html").querySelector("img")!,
    );

    expect(svg).not.toContain("<script>");
    expect(svg).toContain(
      "&lt;script&gt;&quot;x&quot;&amp;&apos;y&apos;&lt;/script&gt;",
    );
  });

  it("leaves decorative images unnamed for screen readers", () => {
    const img = sanitize(
      `<img src="${image}" width="600" height="20" alt="">`,
    ).querySelector("img")!;

    expect(img.getAttribute("alt")).toBe("");
    expect(img.hasAttribute("aria-label")).toBe(false);
    expect(img.hasAttribute("title")).toBe(false);
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
  });
});

describe("blocked images never keep a remote source", () => {
  const remote = /(?:^|[\s,])(?:https?:)?\/\//i;
  const email = `
    <picture>
      <source srcset="https://cdn.example.test/a.webp 1x, //cdn.example.test/a2.webp 2x" type="image/webp">
      <source media="(min-width: 600px)" srcset="http://cdn.example.test/wide.jpg">
      <img src="${image}" srcset="${image} 1x, https://cdn.example.test/b.png 2x" width="320" height="200" alt="Hero">
    </picture>
    <img src="http://cdn.example.test/plain.png" srcset="https://cdn.example.test/plain2.png 2x">
    <img src="//cdn.example.test/protocol.png">
    <img src="https://t.example.test/open.gif" width="1" height="1">`;

  it.each<[string, SanitizeOptions]>([
    ["ask", { external_content_mode: "ask" as const, image_proxy_url: proxy }],
    ["never", { external_content_mode: "never" as const }],
    [
      "content blocking",
      {
        external_content_mode: "always" as const,
        image_proxy_url: proxy,
        content_blocking: {
          block_remote_images: true,
          block_tracking_pixels: true,
        },
      },
    ],
    [
      "lockdown",
      { external_content_mode: "always" as const, lockdown_mode: true },
    ],
  ])("in %s mode", (_mode, options) => {
    const { html } = sanitize_html(email, options);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const images = Array.from(doc.querySelectorAll("img"));

    expect(images.length).toBe(4);
    for (const img of images) {
      expect(img.getAttribute("data-blocked")).toBe("true");
      expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
      expect(img.hasAttribute("srcset")).toBe(false);
    }
    for (const el of Array.from(doc.querySelectorAll("source, img"))) {
      for (const name of ["src", "srcset"]) {
        expect(el.getAttribute(name) ?? "").not.toMatch(remote);
      }
    }
    if (options.lockdown_mode) {
      expect(doc.querySelector("source")).toBeNull();
      expect(html).not.toContain(proxy);
    }
  });
});
