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
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image_proxy", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy")>()),
  get_image_proxy_url: () => "https://app.example/api/images/v1/proxy",
}));

import {
  contain_untrusted_html,
  contain_untrusted_sources,
  get_trusted_image_origins,
} from "@/lib/untrusted_sources";

const TRUSTED = new Set(["https://app.example"]);
const REMOTE = "https://evil.example/px?id=v";
const PROXIED = `https://app.example/api/images/v1/proxy?url=${encodeURIComponent(REMOTE)}`;

function contain(html: string): string {
  return contain_untrusted_html(html, TRUSTED);
}

describe("contain_untrusted_html", () => {
  it.each([
    ["U+0001", "\u0001"],
    ["U+001F", "\u001f"],
    ["mixed", "\u0001 \t\u001f "],
  ])("drops a %s prefixed img src", (_name, prefix) => {
    const html = contain(`<img src="${prefix}${REMOTE}" alt="pic">`);

    expect(html).not.toContain("evil.example");
    expect(html).toContain('alt="pic"');
  });

  it("drops a srcset when any candidate is foreign", () => {
    const html = contain(
      `<img src="${PROXIED}" srcset="data:image/png;base64,AAAA 1x, \u0001${REMOTE} 2x">`,
    );

    expect(html).not.toContain("srcset");
    expect(html).toContain(PROXIED.replace(/&/g, "&amp;"));
  });

  it("drops background, poster and svg image links", () => {
    const html = contain(
      `<table><tr><td background="\u001f${REMOTE}">x</td></tr></table>` +
        `<video poster="//evil.example/p.png"></video>` +
        `<svg><image href="\u0001${REMOTE}"></image><image xlink:href="${REMOTE}"></image></svg>`,
    );

    expect(html).not.toContain("evil.example");
  });

  it("neutralizes foreign urls in style attributes and style elements", () => {
    const html = contain(
      `<style>@import url("${REMOTE}"); .a { background: url("\u0001${REMOTE}"); } .b { background: image-set("${REMOTE}" 1x); }</style>` +
        `<div style="background-image:url('\u0001${REMOTE}')">x</div>`,
    );

    expect(html).not.toContain("evil.example");
  });

  it("keeps data, blob, cid, proxied and same-origin sources", () => {
    const input =
      `<img src="data:image/png;base64,AAAA">` +
      `<img src="blob:https://app.example/1">` +
      `<img src="cid:part1">` +
      `<img src="${PROXIED}">` +
      `<div style="background:url('${PROXIED}')">x</div>`;
    const output = contain(input);

    expect(output).toContain("data:image/png;base64,AAAA");
    expect(output).toContain("blob:https://app.example/1");
    expect(output).toContain("cid:part1");
    expect(output.match(/proxy\?url=/g)?.length).toBe(2);
  });

  it("drops foreign urls even when no origin is trusted", () => {
    const html = contain_untrusted_html(
      `<img src="${PROXIED}"><img src="data:image/png;base64,AAAA">`,
      new Set(),
    );

    expect(html).not.toContain("proxy?url=");
    expect(html).toContain("data:image/png");
  });

  it("counts what it contains", () => {
    const template = document.createElement("template");

    template.innerHTML = `<img src="\u0001${REMOTE}" srcset="${REMOTE} 2x"><table><tr><td background="${REMOTE}"></td></tr></table>`;

    expect(contain_untrusted_sources(template.content, TRUSTED)).toBe(3);
  });
});

describe("get_trusted_image_origins", () => {
  it("includes the image proxy origin", () => {
    expect(get_trusted_image_origins().has("https://app.example")).toBe(true);
  });
});
