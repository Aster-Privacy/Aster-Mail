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

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => "https://app.astermail.org/api/images/v1/proxy",
}));

import {
  get_compose_sanitize_options,
  get_original_image_source,
  restore_compose_image_sources,
} from "@/lib/compose_image_sources";
import { sanitize_html } from "@/lib/html_sanitizer";

const REMOTE = "https://images.example.com/banner.png?size=large&v=2";

describe("compose image sources", () => {
  it("routes remote quoted images through the proxy in the editor", () => {
    const result = sanitize_html(
      `<blockquote><img src="${REMOTE}" alt="banner"></blockquote>`,
      get_compose_sanitize_options(),
    );

    expect(result.html).not.toContain(`src="${REMOTE.replace("&", "&amp;")}"`);
    expect(result.html).toContain("/api/images/v1/proxy?url=");
  });

  it("restores the original source before the body leaves the editor", () => {
    const editor_html = sanitize_html(
      `<p>Hi</p><img src="${REMOTE}" alt="banner">`,
      get_compose_sanitize_options(),
    ).html;

    const restored = restore_compose_image_sources(editor_html);
    const doc = new DOMParser().parseFromString(restored, "text/html");

    expect(doc.querySelector("img")?.getAttribute("src")).toBe(REMOTE);
    expect(restored).not.toContain("/api/images/v1/proxy");
  });

  it("restores relative and onion proxy sources", () => {
    const relative = `<img src="/api/images/v1/proxy?url=${encodeURIComponent(REMOTE)}">`;
    const onion = `<img alt="x" src="http://example.onion/api/images/v1/proxy?url=${encodeURIComponent(REMOTE)}">`;

    expect(restore_compose_image_sources(relative)).toBe(
      `<img src="${REMOTE.replace("&", "&amp;")}">`,
    );
    expect(restore_compose_image_sources(onion)).toContain(
      `src="${REMOTE.replace("&", "&amp;")}"`,
    );
  });

  it("leaves inline, data, and unrelated images untouched", () => {
    const html =
      '<img src="data:image/png;base64,AAAA"><img src="blob:https://app/1"><img src="https://cdn.example.com/a.png">';

    expect(restore_compose_image_sources(html)).toBe(html);
  });

  it("ignores proxy links that do not carry a web address", () => {
    expect(
      get_original_image_source(
        "/api/images/v1/proxy?url=javascript%3Aalert(1)",
      ),
    ).toBeNull();
    expect(get_original_image_source("/api/images/v1/proxy")).toBeNull();
  });

  it("does not rewrite text outside image tags", () => {
    const text = "See /api/images/v1/proxy?url=https%3A%2F%2Fa.example";

    expect(restore_compose_image_sources(text)).toBe(text);
  });
});
