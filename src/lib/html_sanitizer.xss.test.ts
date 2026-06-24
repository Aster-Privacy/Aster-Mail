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

import { sanitize_html } from "./html_sanitizer";

const has_event_handler = (html: string): boolean =>
  /\son[a-z]+\s*=/i.test(html);

const has_javascript_uri = (html: string): boolean =>
  /(?:href|src)\s*=\s*["']?\s*javascript:/i.test(html);

const lower = (html: string): string => html.toLowerCase();

// Asserts the sanitized output cannot execute script under any rendering
// context (top-origin sink or sandboxed iframe). Mirrors the dangerous
// constructs the custom post-DOMPurify walker must never re-introduce.
const expect_inert = (html: string): void => {
  expect(has_event_handler(html)).toBe(false);
  expect(has_javascript_uri(html)).toBe(false);
  const l = lower(html);
  expect(l).not.toContain("javascript:");
  expect(l).not.toContain("vbscript:");
  expect(l).not.toContain("<script");
  expect(l).not.toContain("<iframe");
  expect(l).not.toContain("<object");
  expect(l).not.toContain("<embed");
  expect(l).not.toContain("<form");
  expect(l).not.toContain("expression(");
  expect(l).not.toContain("data:text/html");
  // <base>/<meta http-equiv=refresh> redirection primitives must be gone.
  expect(l).not.toContain("<base");
  expect(l).not.toMatch(/http-equiv\s*=\s*["']?refresh/);
};

describe("sanitize_html xss regression", () => {
  const payloads: Array<{ name: string; input: string }> = [
    { name: "img onerror", input: "<img src=x onerror=alert(1)>" },
    { name: "javascript href", input: '<a href="javascript:alert(1)">x</a>' },
    { name: "svg onload", input: "<svg onload=alert(1)></svg>" },
    {
      name: "details ontoggle",
      input: "<details open ontoggle=alert(1)>x</details>",
    },
    { name: "style import", input: "<style>@import url(//evil)</style>" },
    {
      name: "div onmouseover",
      input: "<div onmouseover=alert(1)>hover</div>",
    },
  ];

  for (const { name, input } of payloads) {
    it(`produces inert output for ${name}`, () => {
      const { html } = sanitize_html(input);

      expect(has_event_handler(html)).toBe(false);
      expect(has_javascript_uri(html)).toBe(false);
      expect(html.toLowerCase()).not.toContain("javascript:");
    });
  }

  it("strips all on* event handler attributes across payloads", () => {
    const combined = payloads.map((p) => p.input).join("");
    const { html } = sanitize_html(combined);

    expect(has_event_handler(html)).toBe(false);
  });

  it("does not emit head style blocks outside sandbox mode", () => {
    const input = "<head><style>@import url(//evil)</style></head><body>hi</body>";
    const { html } = sanitize_html(input, { sandbox_mode: false });

    expect(html).not.toContain("@import");
    expect(html.toLowerCase()).not.toContain("//evil");
  });
});

describe("sanitize_html adversarial / mutation-XSS", () => {
  const adversarial: Array<{ name: string; input: string }> = [
    {
      name: "noscript mutation-xss",
      input: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    },
    {
      name: "math/mglyph/style mutation",
      input:
        "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></mtext></math>",
    },
    {
      name: "svg style xlink",
      input:
        '<svg><style>{}*{}</style><a xlink:href="javascript:alert(1)">x</a></svg>',
    },
    {
      name: "form/math nesting confusion",
      input:
        "<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>",
    },
    { name: "vbscript href", input: '<a href="vbscript:msgbox(1)">x</a>' },
    {
      name: "data text/html href",
      input: '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    },
    { name: "iframe js src", input: '<iframe src="javascript:alert(1)"></iframe>' },
    { name: "object js data", input: '<object data="javascript:alert(1)"></object>' },
    { name: "embed src", input: '<embed src="data:text/html,<script>alert(1)</script>">' },
    {
      name: "meta refresh redirect",
      input: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    },
    { name: "base href hijack", input: '<base href="javascript:alert(1)//">' },
    {
      name: "css expression",
      input: '<div style="width:expression(alert(1))">x</div>',
    },
    {
      name: "css url javascript",
      input: '<div style="background:url(javascript:alert(1))">x</div>',
    },
    {
      name: "entity-encoded javascript scheme",
      input: '<a href="java&#115;cript:alert(1)">x</a>',
    },
    {
      name: "whitespace-obfuscated scheme",
      input: '<a href="  java\tscript:alert(1)">x</a>',
    },
    {
      name: "nested script tags",
      input: "<<script>script>alert(1)<</script>/script>",
    },
    {
      name: "svg foreignObject script",
      input:
        "<svg><foreignObject><script>alert(1)</script></foreignObject></svg>",
    },
    {
      name: "uppercase tag/attr",
      input: '<IMG SRC=x ONERROR="alert(1)">',
    },
    {
      name: "title breakout",
      input: '<title></title><img src=x onerror=alert(1)>',
    },
    {
      name: "textarea breakout",
      input: "<textarea></textarea><img src=x onerror=alert(1)>",
    },
  ];

  for (const { name, input } of adversarial) {
    it(`renders inert output (default) for ${name}`, () => {
      const { html } = sanitize_html(input);
      expect_inert(html);
    });

    it(`renders inert output (sandbox) for ${name}`, () => {
      const { html } = sanitize_html(input, { sandbox_mode: true });
      expect_inert(html);
    });
  }

  it("keeps the combined payload blob inert", () => {
    const combined = adversarial.map((p) => p.input).join("\n");
    expect_inert(sanitize_html(combined).html);
    expect_inert(sanitize_html(combined, { sandbox_mode: true }).html);
  });

  it("entity-encoded </style> cannot break out of the style element on shadow re-parse", () => {
    const input =
      "<style>x{}&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;</style>";
    const { html } = sanitize_html(input, { sandbox_mode: true });

    const host = document.createElement("div");
    host.innerHTML = html;

    expect(host.querySelectorAll("img").length).toBe(0);
    expect(host.querySelectorAll("[onerror]").length).toBe(0);
  });

  it("entity-encoded </style> with case/space variants stays contained on re-parse", () => {
    const variants = [
      "<style>a{}&lt;/STYLE &gt;&lt;img src=x onerror=alert(1)&gt;</style>",
      "<style>b{}&lt;/style\t&gt;&lt;svg onload=alert(1)&gt;</style>",
      "<style>c{}&#x3c;/style&#x3e;&lt;img src=x onerror=alert(1)&gt;</style>",
    ];

    for (const input of variants) {
      const { html } = sanitize_html(input, { sandbox_mode: true });
      const host = document.createElement("div");
      host.innerHTML = html;

      expect(host.querySelectorAll("img").length).toBe(0);
      expect(host.querySelectorAll("svg").length).toBe(0);
      expect(host.querySelectorAll("[onerror], [onload]").length).toBe(0);
    }
  });
});

describe("sanitize_html preserves legitimate content (no over-stripping)", () => {
  it("keeps text, formatting, links and lists", () => {
    const input =
      '<p>Hello <b>world</b> and <i>friends</i>.</p>' +
      '<a href="https://example.com/page?a=1">link</a>' +
      "<ul><li>one</li><li>two</li></ul>" +
      "<blockquote>quoted</blockquote>";
    const { html } = sanitize_html(input);

    expect(html).toContain("Hello");
    expect(html.toLowerCase()).toContain("<b>");
    expect(html.toLowerCase()).toContain("<i>");
    expect(html).toContain("world");
    expect(html).toContain("friends");
    expect(html).toContain("https://example.com/page?a=1");
    expect(html.toLowerCase()).toContain("<li>");
    expect(html).toContain("one");
    expect(html).toContain("two");
    expect(html).toContain("quoted");
    // and still inert
    expect(has_event_handler(html)).toBe(false);
  });

  it("keeps tables and their structure", () => {
    const input =
      "<table><thead><tr><th>H</th></tr></thead>" +
      "<tbody><tr><td>cell</td></tr></tbody></table>";
    const { html } = sanitize_html(input);

    expect(html.toLowerCase()).toContain("<table");
    expect(html.toLowerCase()).toContain("<td");
    expect(html).toContain("cell");
    expect(html).toContain("H");
  });
});
