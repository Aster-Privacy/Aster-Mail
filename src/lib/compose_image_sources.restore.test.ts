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
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  proxy_url: "https://app.astermail.org/api/images/v1/proxy",
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => h.proxy_url,
}));

import {
  get_compose_sanitize_options,
  get_original_image_source,
  proxy_compose_image_sources,
  restore_compose_image_sources,
} from "@/lib/compose_image_sources";
import { sanitize_html } from "@/lib/html_sanitizer";
import { connection_store } from "@/services/routing/connection_store";

const NATIVE_PROXY = "https://app.astermail.org/api/images/v1/proxy";
const WEB_PROXY = "/api/images/v1/proxy";
const ONION_HOST = "exampleonionaddress.onion";
const ONION_PROXY = `http://${ONION_HOST}/api/images/v1/proxy`;
const PROXY_PATH = "/api/images/v1/proxy";

const PICTURE = "https://images.example.com/a.png?size=large&v=2";
const WIDE = "https://images.example.com/wide.png";
const BACKDROP = "https://images.example.com/backdrop.jpg";
const POSTER = "https://images.example.com/poster.jpg";
const STYLED = "https://images.example.com/styled.png";

function proxied(proxy_url: string, url: string): string {
  return `${proxy_url}?url=${encodeURIComponent(url)}`;
}

function attr(value: string): string {
  return value.replace(/&/g, "&amp;");
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><body>${html}</body>`,
    "text/html",
  );
}

function elapsed_ms(run: () => void): number {
  const started = performance.now();

  run();

  return performance.now() - started;
}

afterEach(() => {
  h.proxy_url = NATIVE_PROXY;
  vi.restoreAllMocks();
});

describe.each([
  ["native", NATIVE_PROXY],
  ["web", WEB_PROXY],
  ["onion", ONION_PROXY],
])("restore_compose_image_sources with the %s proxy", (_label, proxy_url) => {
  function use_proxy(): void {
    h.proxy_url = proxy_url;
    vi.spyOn(connection_store, "get_api_onion_url").mockReturnValue(
      `http://${ONION_HOST}`,
    );
  }

  it("restores every proxied attribute on a tag", () => {
    use_proxy();
    const html =
      `<table background="${attr(proxied(proxy_url, BACKDROP))}"><tbody><tr><td>` +
      `<img src="${attr(proxied(proxy_url, PICTURE))}" ` +
      `srcset="${attr(proxied(proxy_url, PICTURE))} 1x, ${attr(proxied(proxy_url, WIDE))} 2x" ` +
      `style="background-image: url(&quot;${attr(proxied(proxy_url, STYLED))}&quot;); width: 10px">` +
      `<video poster="${attr(proxied(proxy_url, POSTER))}"></video>` +
      `<picture><source srcset="${attr(proxied(proxy_url, WIDE))}"></picture>` +
      `</td></tr></tbody></table>`;

    const restored = restore_compose_image_sources(html);
    const doc = parse(restored);
    const image = doc.querySelector("img")!;

    expect(restored).not.toContain(PROXY_PATH);
    expect(doc.querySelector("table")!.getAttribute("background")).toBe(
      BACKDROP,
    );
    expect(image.getAttribute("src")).toBe(PICTURE);
    expect(image.getAttribute("srcset")).toBe(`${PICTURE} 1x, ${WIDE} 2x`);
    expect(image.getAttribute("style")).toBe(
      `background-image: url("${STYLED}"); width: 10px`,
    );
    expect(doc.querySelector("video")!.getAttribute("poster")).toBe(POSTER);
    expect(doc.querySelector("source")!.getAttribute("srcset")).toBe(WIDE);
  });

  it("restores proxied urls in style blocks and blocked image markers", () => {
    use_proxy();
    const html =
      `<style>.a { background: url('${proxied(proxy_url, STYLED)}') }</style>` +
      `<img data-proxy-src="${attr(proxied(proxy_url, PICTURE))}" alt="x">`;

    const restored = restore_compose_image_sources(html);

    expect(restored).not.toContain(PROXY_PATH);
    expect(restored).toContain(`url('${STYLED}')`);
    expect(
      parse(restored).querySelector("img")!.getAttribute("data-proxy-src"),
    ).toBe(PICTURE);
  });

  it("restores what the compose sanitizer produced", () => {
    use_proxy();
    const sanitized = sanitize_html(
      `<table background="${BACKDROP}"><tbody><tr><td>` +
        `<img src="${PICTURE}" srcset="${PICTURE} 1x, ${WIDE} 2x" ` +
        `style="background-image: url('${STYLED}')" alt="x">` +
        `</td></tr></tbody></table>`,
      get_compose_sanitize_options(),
    ).html;

    const restored = restore_compose_image_sources(sanitized);
    const doc = parse(restored);
    const image = doc.querySelector("img")!;
    const background = doc.querySelector("table")!.getAttribute("background");
    const srcset = image.getAttribute("srcset");

    expect(restored).not.toContain(PROXY_PATH);
    expect(image.getAttribute("src")).toBe(PICTURE);
    if (background !== null) expect(background).toBe(BACKDROP);
    if (srcset !== null) expect(srcset).toBe(`${PICTURE} 1x, ${WIDE} 2x`);
  });
});

describe("restore_compose_image_sources", () => {
  it("leaves the markup alone when nothing is proxied", () => {
    const html =
      '<p style="color: red">Hi &amp; bye&nbsp;now</p><img src="https://cdn.example.com/a.png" srcset="https://cdn.example.com/b.png 2x">';

    expect(restore_compose_image_sources(html)).toBe(html);
  });

  it("keeps other style declarations and entities intact", () => {
    const html = `<p style="font-family: &quot;A&amp;B&quot;;&nbsp;background: url(${proxied(NATIVE_PROXY, STYLED)})">x</p>`;

    expect(restore_compose_image_sources(html)).toBe(
      `<p style="font-family: &quot;A&amp;B&quot;;&nbsp;background: url(${STYLED})">x</p>`,
    );
  });

  it("does not restore a proxy link from an unknown host", () => {
    const foreign = attr(
      proxied("https://images.example.net/api/images/v1/proxy", PICTURE),
    );
    const html = `<img src="${foreign}" srcset="${foreign} 2x" style="background: url(${foreign})">`;

    expect(restore_compose_image_sources(html)).toBe(html);
  });

  it("stays linear on many style urls and tags", () => {
    const size = 200_000;
    const urls = `<p style="${"url(".repeat(size / 4)}${PROXY_PATH}">x</p>`;
    const tags = `<img src="${PROXY_PATH}"`.repeat(size / 32);
    const quotes = `<style>${"url('".repeat(size / 5)}${PROXY_PATH}</style>`;

    expect(elapsed_ms(() => restore_compose_image_sources(urls))).toBeLessThan(
      1000,
    );
    expect(elapsed_ms(() => restore_compose_image_sources(tags))).toBeLessThan(
      1000,
    );
    expect(
      elapsed_ms(() => restore_compose_image_sources(quotes)),
    ).toBeLessThan(1000);
  });
});

describe("get_original_image_source", () => {
  it("accepts the app's own proxy origins", () => {
    vi.spyOn(connection_store, "get_api_onion_url").mockReturnValue(ONION_HOST);

    expect(get_original_image_source(proxied(NATIVE_PROXY, PICTURE))).toBe(
      PICTURE,
    );
    expect(get_original_image_source(proxied(WEB_PROXY, PICTURE))).toBe(
      PICTURE,
    );
    expect(get_original_image_source(proxied(ONION_PROXY, PICTURE))).toBe(
      PICTURE,
    );
  });

  it("accepts the page's own origin", () => {
    const page_origin = window.location.origin;

    if (!/^https?:\/\//.test(page_origin)) return;

    expect(
      get_original_image_source(
        proxied(`${page_origin}${PROXY_PATH}`, PICTURE),
      ),
    ).toBe(PICTURE);
  });

  it.each([
    "https://evil.example/api/images/v1/proxy",
    "//evil.example/api/images/v1/proxy",
    "/\\evil.example/api/images/v1/proxy",
    "https://app.astermail.org.evil.example/api/images/v1/proxy",
    "http://other.onion/api/images/v1/proxy",
    "https://app.astermail.org/x/api/images/v1/proxy",
  ])("rejects %s", (proxy_url) => {
    expect(get_original_image_source(proxied(proxy_url, PICTURE))).toBeNull();
  });

  it("proxies a pasted image that points at another host's proxy path", () => {
    const foreign = proxied("https://evil.example/api/images/v1/proxy", PICTURE);
    const result = proxy_compose_image_sources(`<img src="${attr(foreign)}">`);
    const src = parse(result).querySelector("img")!.getAttribute("src");

    expect(src).toBe(proxied(NATIVE_PROXY, foreign));
    expect(get_original_image_source(src!)).toBe(foreign);
  });
});
