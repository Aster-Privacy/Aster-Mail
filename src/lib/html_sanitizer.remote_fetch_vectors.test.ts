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
import { describe, it, expect } from "vitest";

import { sanitize_html } from "./html_sanitizer";
import {
  resolve_remote_content_preferences,
  effective_remote_image_mode,
  type RemoteContentPreferences,
} from "./remote_content_policy";

const HOST = "remote-vector.example";
const REMOTE = `https://${HOST}/asset.png`;
const PROXY = "/api/images/v1/proxy";
const LEAD = "<p>lead</p>";

const FETCHING_ATTRIBUTES = [
  "src",
  "srcset",
  "href",
  "xlink:href",
  "poster",
  "background",
  "data",
  "action",
  "formaction",
  "imagesrcset",
  "lowsrc",
  "dynsrc",
  "longdesc",
  "ping",
  "manifest",
  "code",
  "codebase",
  "archive",
  "content",
];

const VECTORS: Array<[string, string]> = [
  ["img src", `<img src="${REMOTE}" width="200" height="100" alt="a">`],
  [
    "img srcset",
    `<img src="${REMOTE}" srcset="${REMOTE} 1x, ${REMOTE} 2x" alt="a">`,
  ],
  ["img srcset without src", `<img srcset="${REMOTE} 2x" alt="a">`],
  ["protocol relative img", `<img src="//${HOST}/asset.png" alt="a">`],
  ["uppercase scheme img", `<img src="HTTPS://${HOST}/asset.png" alt="a">`],
  [
    "picture source srcset",
    `<picture><source srcset="${REMOTE}" type="image/png"><img src="${REMOTE}" alt="a"></picture>`,
  ],
  [
    "picture source src",
    `<picture><source src="${REMOTE}" type="image/png"><img alt="a"></picture>`,
  ],
  ["lone source src", `<source src="${REMOTE}">`],
  ["img lowsrc", `<img lowsrc="${REMOTE}" alt="a">`],
  ["img dynsrc", `<img dynsrc="${REMOTE}" alt="a">`],
  ["img longdesc", `<img longdesc="${REMOTE}" alt="a">`],
  ["table background", `<table background="${REMOTE}"><tr><td>x</td></tr></table>`],
  ["cell background", `<table><tr><td background="${REMOTE}">x</td></tr></table>`],
  ["body background", `<body background="${REMOTE}"><p>x</p></body>`],
  [
    "inline background image",
    `<div style="background-image:url(${REMOTE})">x</div>`,
  ],
  [
    "inline background shorthand",
    `<div style="background:#fff url('${REMOTE}') no-repeat">x</div>`,
  ],
  [
    "inline list style image",
    `<ul style="list-style-image:url(&quot;${REMOTE}&quot;)"><li>x</li></ul>`,
  ],
  ["inline cursor", `<div style="cursor:url(${REMOTE}),auto">x</div>`],
  ["inline content url", `<div style="content:url(${REMOTE})">x</div>`],
  [
    "inline border image",
    `<div style="border-image:url(${REMOTE}) 30 round">x</div>`,
  ],
  [
    "inline mask image",
    `<div style="mask-image:url(${REMOTE});-webkit-mask-image:url(${REMOTE})">x</div>`,
  ],
  [
    "inline image set",
    `<div style="background-image:image-set('${REMOTE}' 1x)">x</div>`,
  ],
  [
    "inline escaped url",
    `<div style="background-image:u\\72l(${REMOTE})">x</div>`,
  ],
  [
    "style block background",
    `<style>.a{background:url(${REMOTE})}</style><div class="a">x</div>`,
  ],
  ["style block import", `<style>@import url(${REMOTE});</style><p>x</p>`],
  ["style block bare import", `<style>@import "${REMOTE}";</style><p>x</p>`],
  [
    "style block font face",
    `<style>@font-face{font-family:f;src:url(${REMOTE})}</style><p style="font-family:f">x</p>`,
  ],
  ["video poster", `<video poster="${REMOTE}"></video>`],
  ["video src", `<video src="${REMOTE}" autoplay></video>`],
  [
    "video source",
    `<video autoplay><source src="${REMOTE}" type="video/mp4"></video>`,
  ],
  ["audio src", `<audio src="${REMOTE}" autoplay></audio>`],
  ["track src", `<video><track src="${REMOTE}" default></video>`],
  [
    "svg image href",
    `<svg xmlns="http://www.w3.org/2000/svg"><image href="${REMOTE}" width="10" height="10"/></svg>`,
  ],
  [
    "svg image xlink href",
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="${REMOTE}"/></svg>`,
  ],
  [
    "svg use href",
    `<svg xmlns="http://www.w3.org/2000/svg"><use href="${REMOTE}#a"/></svg>`,
  ],
  [
    "svg fe image",
    `<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feImage href="${REMOTE}"/></filter></svg>`,
  ],
  ["link preload", `<link rel="preload" as="image" href="${REMOTE}">`],
  ["link prefetch", `<link rel="prefetch" href="${REMOTE}">`],
  ["link dns prefetch", `<link rel="dns-prefetch" href="//${HOST}">`],
  ["link preconnect", `<link rel="preconnect" href="https://${HOST}">`],
  ["link stylesheet", `<link rel="stylesheet" href="${REMOTE}">`],
  ["link icon", `<link rel="icon" href="${REMOTE}">`],
  [
    "link imagesrcset",
    `<link rel="preload" as="image" imagesrcset="${REMOTE} 2x">`,
  ],
  ["meta refresh", `<meta http-equiv="refresh" content="0;url=${REMOTE}">`],
  ["object data", `<object data="${REMOTE}" type="image/png"></object>`],
  ["embed src", `<embed src="${REMOTE}" type="image/png">`],
  ["iframe src", `<iframe src="${REMOTE}"></iframe>`],
  ["frame src", `<frameset><frame src="${REMOTE}"></frameset>`],
  ["input image", `<input type="image" src="${REMOTE}" alt="a">`],
  [
    "form action",
    `<form action="${REMOTE}"><button formaction="${REMOTE}">x</button></form>`,
  ],
  ["base href", `<base href="https://${HOST}/"><img src="asset.png" alt="a">`],
  ["anchor ping", `<a href="https://example.org/" ping="${REMOTE}">x</a>`],
  ["bgsound", `<bgsound src="${REMOTE}">`],
  ["applet", `<applet code="a.class" codebase="https://${HOST}/"></applet>`],
  ["script src", `<script src="${REMOTE}"></script>`],
  ["html manifest", `<html manifest="${REMOTE}"><body><p>x</p></body></html>`],
];

function remote_references(html: string): string[] {
  const doc = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  );
  const found: string[] = [];

  doc.querySelectorAll("*").forEach((element) => {
    const tag = element.tagName.toLowerCase();

    for (const name of FETCHING_ATTRIBUTES) {
      if (name === "href" && tag === "a") continue;

      const value = element.getAttribute(name);

      if (value && value.toLowerCase().includes(HOST)) {
        found.push(`${tag}[${name}]`);
      }
    }

    const style = element.getAttribute("style");

    if (style && style.toLowerCase().includes(HOST)) {
      found.push(`${tag}[style]`);
    }
    if (tag === "style" && (element.textContent ?? "").includes(HOST)) {
      found.push("style block");
    }
  });

  return found;
}

function stored_preferences(
  mode: "never" | "ask",
  block_external_content: boolean,
): RemoteContentPreferences {
  return {
    load_remote_images: mode,
    block_external_content,
    block_remote_images: true,
    block_remote_fonts: true,
    block_remote_css: true,
    block_tracking_pixels: block_external_content,
    low_network_mode: false,
  };
}

describe.each([
  ["never", true],
  ["never", false],
  ["ask", true],
  ["ask", false],
] as const)(
  "remote fetch vectors with image loading %s and tracking protection %s",
  (mode, block_external_content) => {
    const preferences = stored_preferences(mode, block_external_content);

    it.each(VECTORS)("keeps %s from fetching", (_name, markup) => {
      const result = sanitize_html(`${LEAD}${markup}`, {
        external_content_mode: effective_remote_image_mode(preferences),
        image_proxy_url: PROXY,
        sandbox_mode: true,
        content_blocking: resolve_remote_content_preferences(preferences),
      });

      expect(remote_references(result.html)).toEqual([]);
    });

    it.each(VECTORS)(
      "keeps %s from fetching without explicit blocking flags",
      (_name, markup) => {
        const result = sanitize_html(`${LEAD}${markup}`, {
          external_content_mode: mode,
          image_proxy_url: PROXY,
        });

        expect(remote_references(result.html)).toEqual([]);
      },
    );
  },
);

describe("remote fetch vectors once loading is allowed", () => {
  it("never leaves a direct remote image reference when a proxy is set", () => {
    const direct: string[] = [];

    for (const [name, markup] of VECTORS) {
      const result = sanitize_html(`${LEAD}${markup}`, {
        external_content_mode: "always",
        image_proxy_url: PROXY,
        sandbox_mode: true,
      });
      const doc = new DOMParser().parseFromString(
        `<body>${result.html}</body>`,
        "text/html",
      );

      doc.querySelectorAll("img, source").forEach((element) => {
        for (const attribute of ["src", "srcset"]) {
          const value = element.getAttribute(attribute) ?? "";

          for (const candidate of value.split(",")) {
            const url = candidate.trim().split(/\s+/)[0] ?? "";

            if (/^(?:https?:)?\/\//i.test(url)) direct.push(name);
          }
        }
      });
    }

    expect(direct).toEqual([]);
  });
});
