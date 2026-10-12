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

const h = vi.hoisted(() => ({ lockdown: false }));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => h.lockdown,
}));

vi.mock("@/lib/image_proxy", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy")>()),
  get_image_proxy_url: () => "https://app.example/api/images/v1/proxy",
}));

import {
  build_editable_quoted_fragment,
  read_editable_quoted_html,
} from "@/lib/editable_quoted_html";

function mount(html: string, block_remote_images = false): HTMLDivElement {
  const container = document.createElement("div");

  container.replaceChildren(
    build_editable_quoted_fragment(html, { block_remote_images }),
  );

  return container;
}

const forwarded =
  "---------- Forwarded message ---------<br>From: Sam &lt;sam@example.com&gt;<br><br><p>Body text</p>";

describe("editable forwarded message", () => {
  it("round trips plain content unchanged in meaning", () => {
    const container = mount(forwarded);
    const result = read_editable_quoted_html(container);

    expect(result).toContain("sam@example.com");
    expect(result).toContain("Body text");
  });

  it("drops the sender line once it is deleted", () => {
    const container = mount(
      "<div>From: Sam Doe</div><div>Subject: Plans</div><p>Body text</p>",
    );

    container.querySelector("div")!.remove();

    const result = read_editable_quoted_html(container);

    expect(result).not.toContain("Sam Doe");
    expect(result).toContain("Subject: Plans");
    expect(result).toContain("Body text");
  });

  it("removes scripts and event handlers", () => {
    const container = mount(
      '<p onclick="x()">Hi</p><script>alert(1)</script><img src="x" onerror="y()">',
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("onclick");
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("loads a remote image through the proxy and sends the original", () => {
    const container = mount('<img src="https://cdn.example/logo.png">');
    const image = container.querySelector("img")!;

    expect(image.getAttribute("src")).toContain("/api/images/v1/proxy?url=");

    const result = read_editable_quoted_html(container);

    expect(result).toContain('src="https://cdn.example/logo.png"');
    expect(result).not.toContain("/api/images/v1/proxy");
  });

  it("does not load a remote image when images are blocked", () => {
    const container = mount('<img src="https://cdn.example/logo.png">', true);
    const image = container.querySelector("img")!;

    expect(image.hasAttribute("src")).toBe(false);

    const result = read_editable_quoted_html(container);

    expect(result).toContain('src="https://cdn.example/logo.png"');
    expect(result).not.toContain("data-aster-parked-src");
  });

  it("keeps an inline image reference for the send", () => {
    const container = mount('<p>Logo</p><img src="cid:logo@example">');
    const image = container.querySelector("img")!;

    expect(image.hasAttribute("src")).toBe(false);
    expect(read_editable_quoted_html(container)).toContain(
      'src="cid:logo@example"',
    );
  });

  it("restores a blocked image whose description names the parked attribute", () => {
    const container = mount(
      '<img alt="b data-aster-parked-src=x" src="https://cdn.example/logo.png">',
      true,
    );
    const result = read_editable_quoted_html(container);

    expect(result).toContain('src="https://cdn.example/logo.png"');
    expect(result).toContain("b data-aster-parked-src=x");
  });

  it("leaves the live editor untouched when it reads the content", () => {
    const container = mount('<img src="cid:logo@example">');

    read_editable_quoted_html(container);

    expect(container.querySelector("img")!.hasAttribute("src")).toBe(false);
  });
});
