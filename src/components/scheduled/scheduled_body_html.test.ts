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
import { beforeEach, describe, expect, it, vi } from "vitest";

const lockdown = vi.hoisted(() => ({ active: false }));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => lockdown.active,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => "https://proxy.example/image",
}));

import { scheduled_body_html } from "@/components/scheduled/scheduled_body_html";

const BODY =
  '<div><p>Hello</p><img src="https://cdn.example/photo.png" width="200" height="100" alt="Photo"><div style="background-image:url(https://cdn.example/bg.png)">x</div></div>';

function fetchable(html: string): string[] {
  const template = document.createElement("template");

  template.innerHTML = html;

  const found: string[] = [];

  template.content.querySelectorAll("*").forEach((element) => {
    for (const name of ["src", "srcset", "background", "poster"]) {
      const value = element.getAttribute(name);

      if (value && /^https?:/i.test(value.trim())) found.push(value);
    }

    const style = element.getAttribute("style") ?? "";

    if (/url\(\s*['"]?https?:/i.test(style)) found.push(style);
  });

  return found;
}

describe("scheduled message body", () => {
  beforeEach(() => {
    lockdown.active = false;
  });

  it("fetches nothing when remote images are set to never load", () => {
    const html = scheduled_body_html(BODY, {
      load_remote_images: "never",
      block_remote_images: true,
    });

    expect(fetchable(html)).toEqual([]);
    expect(html).not.toContain("proxy.example");
    expect(html).toContain("Hello");
  });

  it("fetches nothing when remote images are set to ask", () => {
    const html = scheduled_body_html(BODY, {
      load_remote_images: "ask",
      block_remote_images: true,
    });

    expect(fetchable(html)).toEqual([]);
    expect(html).not.toContain("proxy.example");
  });

  it("fetches nothing in low network mode", () => {
    const html = scheduled_body_html(BODY, {
      load_remote_images: "always",
      block_remote_images: false,
      low_network_mode: true,
    });

    expect(fetchable(html)).toEqual([]);
  });

  it("loads images through the proxy when remote images always load", () => {
    const html = scheduled_body_html(BODY, {
      load_remote_images: "always",
      block_remote_images: true,
    });

    expect(html).toContain("proxy.example");
    expect(html).not.toContain('src="https://cdn.example/photo.png"');
  });

  it("fetches nothing while lockdown is active", () => {
    lockdown.active = true;

    const html = scheduled_body_html(BODY, {
      load_remote_images: "always",
      block_remote_images: false,
    });

    expect(fetchable(html)).toEqual([]);
    expect(html).not.toContain("proxy.example");
  });

  it("renders plain text without markup", () => {
    expect(
      scheduled_body_html("line <b>one</b>", {
        load_remote_images: "never",
        block_remote_images: true,
      }),
    ).not.toContain("<b>");
  });
});
