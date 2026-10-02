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

import { sanitize_html, type SanitizeOptions } from "./html_sanitizer";
import {
  list_remote_css_urls,
  proxy_css_urls,
  sanitize_compose_style,
  sanitize_style,
  strip_css_urls,
} from "./html_sanitizer_css";

const COLLECTOR = "https://collector.example/p.png";
const PROXY = "/api/images/v1/proxy";

const BLOCKED_MODES: Array<{ name: string; options: SanitizeOptions }> = [
  {
    name: "never with blocking",
    options: {
      external_content_mode: "never",
      image_proxy_url: PROXY,
      sandbox_mode: true,
      content_blocking: {
        block_remote_images: true,
        block_remote_fonts: true,
        block_remote_css: true,
        block_tracking_pixels: true,
      },
    },
  },
  {
    name: "ask",
    options: {
      external_content_mode: "ask",
      image_proxy_url: PROXY,
      sandbox_mode: true,
    },
  },
  {
    name: "ask without sandbox",
    options: { external_content_mode: "ask", image_proxy_url: PROXY },
  },
  {
    name: "lockdown",
    options: {
      external_content_mode: "always",
      image_proxy_url: PROXY,
      sandbox_mode: true,
      lockdown_mode: true,
    },
  },
];

describe("css url() inside strings", () => {
  it("strips a remote url hidden behind a string with a fake url(#", () => {
    const out = strip_css_urls(`p{x:"url(#";background:url(${COLLECTOR})}`);

    expect(out).not.toContain("collector.example");
    expect(out).toContain('x:"url(#"');
    expect(out).toContain("background:none");
  });

  it("strips the same payload with single quotes and a cid: decoy", () => {
    const out = strip_css_urls(`p{x:'url(cid:';background:url(${COLLECTOR})}`);

    expect(out).not.toContain("collector.example");
  });

  it("strips a remote url after a string closed by a newline", () => {
    const out = strip_css_urls(`p{x:"url(#\nbackground:url(${COLLECTOR})}`);

    expect(out).not.toContain("collector.example");
  });

  it("strips a remote url still open at the end of the stylesheet", () => {
    expect(strip_css_urls(`p{background:url(${COLLECTOR}`)).not.toContain(
      "collector.example",
    );
    expect(strip_css_urls(`p{background:url("${COLLECTOR}`)).not.toContain(
      "collector.example",
    );
  });

  it("drops a url call whose quoted argument is followed by garbage", () => {
    const out = strip_css_urls(`p{background:url("#" ${COLLECTOR})}`);

    expect(out).not.toContain("collector.example");
  });

  it("drops an unquoted url that contains a quote or a parenthesis", () => {
    expect(strip_css_urls(`p{background:url(#"${COLLECTOR})}`)).not.toContain(
      "collector.example",
    );
    expect(strip_css_urls(`p{background:url(#(${COLLECTOR}))}`)).not.toContain(
      "collector.example",
    );
  });

  it("treats a src() call like url()", () => {
    expect(strip_css_urls(`p{background:src("${COLLECTOR}")}`)).not.toContain(
      "collector.example",
    );
  });

  it("strips a remote url hidden after an escaped quote", () => {
    const out = strip_css_urls(`p{x:"a\\22;background:url(${COLLECTOR})"}`);

    expect(out).not.toContain("collector.example");
  });

  it("strips a remote url in an image-set decoy string", () => {
    const out = strip_css_urls(
      `p{background:image-set("url(#" 1x, url(${COLLECTOR}) 2x)}`,
    );

    expect(out).not.toContain("collector.example");
  });

  it("drops an image-set whose string closes the call early", () => {
    const out = strip_css_urls(
      `p{background:image-set(")" 0.5x, "${COLLECTOR}" 1x)}`,
    );

    expect(out).not.toContain("collector.example");
  });

  it("keeps local sources and proxies remote ones when allowed", () => {
    const out = strip_css_urls(
      `p{a:url(cid:x@y);b:url("#frag");c:url(blob:abc);d:url(data:image/png;base64,AA);e:url(${COLLECTOR})}`,
      { image_proxy_url: PROXY },
    );

    expect(out).toContain("url(cid:x@y)");
    expect(out).toContain('url("#frag")');
    expect(out).toContain("url(blob:abc)");
    expect(out).toContain("url(data:image/png;base64,AA)");
    expect(out).toContain(`${PROXY}?url=${encodeURIComponent(COLLECTOR)}`);
    expect(out).not.toContain(`url(${COLLECTOR})`);
  });

  it("proxies a remote url that follows a decoy string when allowed", () => {
    const out = strip_css_urls(`p{x:"url(#";background:url(${COLLECTOR})}`, {
      image_proxy_url: PROXY,
    });

    expect(out).toContain(`${PROXY}?url=${encodeURIComponent(COLLECTOR)}`);
    expect(out).not.toContain(`url(${COLLECTOR})`);
  });

  it("proxies font urls behind a decoy string", () => {
    const out = proxy_css_urls(
      `@font-face{font-family:F;x:"url(#";src:url(${COLLECTOR})}`,
      PROXY,
    );

    expect(out).toContain("/api/content/v1/proxy?url=");
    expect(out).not.toContain(`url(${COLLECTOR})`);
  });

  it("lists remote urls outside strings only", () => {
    expect(
      list_remote_css_urls(
        `p{x:"url(https://inside.example/s.png)";background:url(${COLLECTOR});b:url(cid:a)}`,
      ),
    ).toEqual([COLLECTOR]);
  });

  it("lists a remote url whose url keyword is escaped", () => {
    expect(list_remote_css_urls(`p{background:u\\72 l(${COLLECTOR})}`)).toEqual(
      [COLLECTOR],
    );
    expect(
      list_remote_css_urls(`p{background:/*x*/url(/*y*/${COLLECTOR})}`),
    ).toEqual([COLLECTOR]);
  });

  it("drops an escaped or comment split url from a compose style", () => {
    const BS = String.fromCharCode(92);

    expect(
      sanitize_compose_style(`color:red;background:u${BS}72 l(${COLLECTOR})`),
    ).toBe("color: red");
    expect(
      sanitize_compose_style(`color:red;background:u/**/rl(${COLLECTOR})`),
    ).toBe("color: red");
  });

  it("strips the payload from an inline style outside sandbox mode", () => {
    expect(
      sanitize_style(`x:"url(#";background:url(${COLLECTOR})`, false),
    ).not.toContain("collector.example");
  });
});

describe("sanitize_html with a css url() hidden behind a string", () => {
  const inline = `<p style='x:"url(#";background:url(${COLLECTOR})'>hi</p>`;
  const block = `<html><head><style>p{x:"url(#";background:url(${COLLECTOR})}</style></head><body><p>hi</p></body></html>`;
  const body_block = `<div><style>p{x:"url(#";background:url(${COLLECTOR})}</style><p>hi</p></div>`;

  for (const mode of BLOCKED_MODES) {
    it(`removes it from an inline style in ${mode.name}`, () => {
      const result = sanitize_html(inline, mode.options);

      expect(result.html).not.toContain("collector.example");
    });

    it(`removes it from a head style block in ${mode.name}`, () => {
      const result = sanitize_html(block, mode.options);

      expect(result.html).not.toContain("collector.example");
    });

    it(`removes it from a body style block in ${mode.name}`, () => {
      const result = sanitize_html(body_block, mode.options);

      expect(result.html).not.toContain("collector.example");
    });
  }

  it("counts the hidden url as blocked in an inline style", () => {
    const result = sanitize_html(inline, {
      external_content_mode: "ask",
      image_proxy_url: PROXY,
      sandbox_mode: true,
    });

    expect(result.external_content.blocked_count).toBe(1);
    expect(result.external_content.has_remote_css).toBe(true);
    expect(result.external_content.blocked_items[0]).toEqual({
      url: COLLECTOR,
      type: "css",
    });
  });

  it("counts the hidden url as blocked in a style block", () => {
    const result = sanitize_html(body_block, {
      external_content_mode: "ask",
      image_proxy_url: PROXY,
      sandbox_mode: true,
    });

    expect(result.external_content.blocked_count).toBe(1);
  });

  it("counts a url whose url keyword is escaped in an inline style", () => {
    const result = sanitize_html(
      `<p style='background:u\\72 l(${COLLECTOR})'>hi</p>`,
      {
        external_content_mode: "ask",
        image_proxy_url: PROXY,
        sandbox_mode: true,
      },
    );

    expect(result.html).not.toContain("collector.example");
    expect(result.external_content.blocked_count).toBe(1);
  });

  it("does not count a url that only appears inside a string", () => {
    const result = sanitize_html(`<p style='x:"url(${COLLECTOR})"'>hi</p>`, {
      external_content_mode: "ask",
      image_proxy_url: PROXY,
      sandbox_mode: true,
    });

    expect(result.external_content.blocked_count).toBe(0);
  });

  it("proxies the url when remote content is allowed", () => {
    const encoded = encodeURIComponent(COLLECTOR);

    for (const html of [inline, body_block]) {
      const result = sanitize_html(html, {
        external_content_mode: "always",
        image_proxy_url: PROXY,
        sandbox_mode: true,
      });

      expect(result.html).toContain(`${PROXY}?url=${encoded}`);
      expect(result.html).not.toContain(`url(${COLLECTOR})`);
    }
  });
});
