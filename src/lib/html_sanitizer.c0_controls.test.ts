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

import { sanitize_html, type SanitizeOptions } from "./html_sanitizer";

const REMOTE = "https://evil.example/px?id=v";
const PROXY = "https://app.example/api/images/v1/proxy";
const LEAD = "<p>lead</p>";
const SPLITS_CANDIDATE = / |&#9;/;
const PROXIED_PATTERN =
  /https:\/\/app\.example\/api\/images\/v1\/proxy\?url=[^\s"')]*/g;

const PREFIXES: Array<[string, string]> = [
  ["U+0001 entity", "&#1;"],
  ["U+001F entity", "&#31;"],
  ["U+0001 raw", "\u0001"],
  ["U+001F raw", "\u001f"],
  ["mixed controls and spaces", "&#1; &#9;&#31;&#11; "],
];

const SUFFIXES: Array<[string, string]> = [
  ["none", ""],
  ["trailing control", "&#1;"],
  ["trailing controls and spaces", "&#31; &#8;"],
];

const VARIANTS = PREFIXES.flatMap(([prefix_name, prefix]) =>
  SUFFIXES.map(
    ([suffix_name, suffix]) =>
      [`${prefix_name}, suffix ${suffix_name}`, prefix, suffix] as const,
  ),
);

const BLOCKING_MODES: Array<[string, SanitizeOptions]> = [
  ["never", { external_content_mode: "never", image_proxy_url: PROXY }],
  ["ask", { external_content_mode: "ask", image_proxy_url: PROXY }],
  [
    "lockdown",
    {
      external_content_mode: "never",
      lockdown_mode: true,
      image_proxy_url: PROXY,
    },
  ],
];

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function loading_values(doc: Document): string[] {
  const values: string[] = [];

  doc.querySelectorAll("*").forEach((element) => {
    for (const name of ["src", "srcset", "background", "poster", "style"]) {
      const value = element.getAttribute(name);

      if (value !== null) values.push(value);
    }
  });
  doc.querySelectorAll("style").forEach((style) => {
    values.push(style.textContent ?? "");
  });

  return values;
}

function expect_no_direct_fetch(html: string): void {
  for (const value of loading_values(parse(html))) {
    expect(value.replace(PROXIED_PATTERN, "").toLowerCase()).not.toContain(
      "evil.example",
    );
  }
}

function img_attribute(html: string, name: string): string | null {
  return parse(html).querySelector("img")?.getAttribute(name) ?? null;
}

describe("C0 control prefixed remote image URLs", () => {
  describe.each(BLOCKING_MODES)("mode %s", (_mode, options) => {
    it.each(VARIANTS)(
      "blocks and counts img src (%s)",
      (_name, prefix, suffix) => {
        const result = sanitize_html(
          `${LEAD}<img src="${prefix}${REMOTE}${suffix}" width="200" height="100" alt="pic">`,
          options,
        );

        expect(result.external_content.has_remote_images).toBe(true);
        expect(result.external_content.blocked_count).toBeGreaterThan(0);
        expect(
          result.external_content.blocked_items.map((item) => item.url),
        ).toContain(REMOTE);
        expect_no_direct_fetch(result.html);
        expect(img_attribute(result.html, "src") ?? "").not.toContain(
          "evil.example",
        );
      },
    );

    it.each(VARIANTS)(
      "blocks and counts a srcset 2x candidate (%s)",
      (_name, prefix, suffix) => {
        const result = sanitize_html(
          `${LEAD}<img src="data:image/png;base64,iVBORw0KGgo=" srcset="data:image/png;base64,iVBORw0KGgo= 1x, ${prefix}${REMOTE}${suffix} 2x" alt="pic">`,
          options,
        );

        expect_no_direct_fetch(result.html);

        if (SPLITS_CANDIDATE.test(prefix)) {
          expect(img_attribute(result.html, "srcset") ?? "").not.toContain(
            "evil.example",
          );

          return;
        }

        expect(result.external_content.has_remote_images).toBe(true);
        expect(
          result.external_content.blocked_items.map((item) => item.url),
        ).toContain(REMOTE);
      },
    );

    it.each(VARIANTS)(
      "blocks and counts a td background (%s)",
      (_name, prefix, suffix) => {
        const result = sanitize_html(
          `${LEAD}<table><tr><td background="${prefix}${REMOTE}${suffix}">cell</td></tr></table>`,
          options,
        );

        expect(result.external_content.has_remote_images).toBe(true);
        expect(result.external_content.blocked_count).toBeGreaterThan(0);
        expect(result.html).not.toContain("evil.example");
      },
    );

    it.each(["'", "&quot;"])(
      "removes a %s quoted style url with a control prefix",
      (quote) => {
        const result = sanitize_html(
          `${LEAD}<div style="background-image:url(${quote}\u0001${REMOTE}${quote})">x</div>`,
          { ...options, sandbox_mode: true },
        );

        expect(result.external_content.blocked_items).toContainEqual({
          url: REMOTE,
          type: "css",
        });
        expect(result.html).not.toContain("evil.example");
        expect(
          parse(result.html).querySelector("div")?.getAttribute("style"),
        ).toContain("none");
      },
    );
  });

  describe("mode always with the image proxy", () => {
    const options: SanitizeOptions = {
      external_content_mode: "always",
      image_proxy_url: PROXY,
    };
    const proxied = `${PROXY}?url=${encodeURIComponent(REMOTE)}`;

    it.each(VARIANTS)("proxies img src (%s)", (_name, prefix, suffix) => {
      const result = sanitize_html(
        `${LEAD}<img src="${prefix}${REMOTE}${suffix}" width="200" height="100" alt="pic">`,
        options,
      );

      expect(result.external_content.has_remote_images).toBe(true);
      expect(img_attribute(result.html, "src")?.startsWith(proxied)).toBe(true);
      expect_no_direct_fetch(result.html);
    });

    it.each(VARIANTS)(
      "proxies the srcset 2x candidate (%s)",
      (_name, prefix, suffix) => {
        const result = sanitize_html(
          `${LEAD}<img src="${proxied}" srcset="${prefix}${REMOTE}${suffix} 2x" alt="pic">`,
          options,
        );
        const srcset = img_attribute(result.html, "srcset");

        expect_no_direct_fetch(result.html);

        if (SPLITS_CANDIDATE.test(prefix)) {
          expect(srcset ?? "").not.toContain("evil.example");

          return;
        }

        expect(srcset).toContain(encodeURIComponent(REMOTE));
        expect(srcset?.startsWith(PROXY)).toBe(true);
      },
    );

    it.each(VARIANTS)(
      "proxies a td background (%s)",
      (_name, prefix, suffix) => {
        const result = sanitize_html(
          `${LEAD}<table><tr><td background="${prefix}${REMOTE}${suffix}">cell</td></tr></table>`,
          options,
        );
        const background = parse(result.html)
          .querySelector("td")
          ?.getAttribute("background");

        expect(background?.startsWith(proxied)).toBe(true);
        expect_no_direct_fetch(result.html);
      },
    );

    it("proxies a control-prefixed scheme-relative img src over https", () => {
      const result = sanitize_html(
        `${LEAD}<img src="&#1;//evil.example/px?id=v" width="200" height="100" alt="pic">`,
        options,
      );

      expect(img_attribute(result.html, "src")).toContain(
        encodeURIComponent(REMOTE),
      );
      expect_no_direct_fetch(result.html);
    });

    it("proxies a quoted style url with a control prefix", () => {
      const result = sanitize_html(
        `${LEAD}<div style="background-image:url('\u001f${REMOTE}')">x</div>`,
        { ...options, sandbox_mode: true },
      );

      expect(result.html).toContain(encodeURIComponent(REMOTE));
      expect_no_direct_fetch(result.html);
    });
  });

  it("turns a NUL reference into U+FFFD, which never resolves to the remote host", () => {
    const result = sanitize_html(
      `${LEAD}<img src="&#0;${REMOTE}" width="200" height="100" alt="pic">`,
      { external_content_mode: "never", image_proxy_url: PROXY },
    );
    const src = img_attribute(result.html, "src");

    if (src) {
      expect(new URL(src, "https://app.example/").origin).toBe(
        "https://app.example",
      );
    }
  });

  describe("local and proxied sources keep working", () => {
    const options: SanitizeOptions = {
      external_content_mode: "never",
      image_proxy_url: PROXY,
    };

    it("keeps a control-prefixed data image", () => {
      const result = sanitize_html(
        `${LEAD}<img src="&#1;data:image/png;base64,iVBORw0KGgo=" alt="pic">`,
        options,
      );

      expect(img_attribute(result.html, "src")).toBe(
        "data:image/png;base64,iVBORw0KGgo=",
      );
      expect(result.external_content.blocked_count).toBe(0);
    });

    it("keeps cid references for the inline image resolver", () => {
      const result = sanitize_html(
        `${LEAD}<img src="cid:part1@example" alt="pic">`,
        options,
      );

      expect(result.html).toContain("cid:part1@example");
      expect(result.external_content.blocked_count).toBe(0);
    });

    it("keeps an already proxied image on the proxy", () => {
      const result = sanitize_html(
        `${LEAD}<img src="${PROXY}?url=${encodeURIComponent(REMOTE)}" alt="pic">`,
        { external_content_mode: "always", image_proxy_url: PROXY },
      );

      expect(img_attribute(result.html, "src")).toContain(PROXY);
      expect_no_direct_fetch(result.html);
    });
  });
});
