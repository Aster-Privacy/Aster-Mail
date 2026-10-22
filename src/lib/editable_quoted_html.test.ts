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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEFAULT_PROXY_URL = "https://app.example/api/images/v1/proxy";

const h = vi.hoisted(() => ({
  lockdown: false,
  proxy_url: "https://app.example/api/images/v1/proxy",
}));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => h.lockdown,
}));

vi.mock("@/lib/image_proxy", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy")>()),
  get_image_proxy_url: () => h.proxy_url,
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

const DIOGO_INPUT =
  '<img src="https://evil.example/px?id=v"><table background="https://evil.example/tb"><tr><td>x</td></tr></table><picture><source srcset="https://evil.example/src"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></picture>';

const RICH_INPUT =
  '<style>.hero { background-image: url("https://evil.example/css-bg"); color: red; } .x { background: image-set("https://evil.example/set.png" 1x); }</style>' +
  '<div style="background-image: url(https://evil.example/inline-bg); color: blue">styled</div>' +
  '<div style="background: u\\72l(https://evil.example/escaped)">escaped</div>' +
  '<table><tr><td background="//evil.example/protocol-relative">cell</td></tr></table>' +
  '<img src="//evil.example/protocol-relative.png" alt="pr">' +
  '<img src="http://evil.example/plain.png" srcset="https://evil.example/a.png 1x, https://evil.example/b.png 2x">' +
  '<picture><source srcset="https://evil.example/s1.webp 1x" type="image/webp"><img src="https://evil.example/fallback.png"></picture>' +
  '<img src="cid:logo@example">' +
  '<p>Keep <a href="https://example.com/link">this link</a> and <b>formatting</b></p>' +
  '<input type="image" src="https://evil.example/input.png">' +
  '<svg><image href="https://evil.example/svg.png"></image><use href="https://evil.example/use.svg#a"></use></svg>' +
  '<link rel="stylesheet" href="https://evil.example/style.css">' +
  '<video poster="https://evil.example/poster.png" src="https://evil.example/v.mp4"></video>';

const NETWORK_VALUE = /(?:https?:|\/\/|\/api\/|url\(\s*["']?(?!data:|cid:|#))/i;

const LOADING_TAGS = new Set([
  "link",
  "input",
  "svg",
  "image",
  "use",
  "video",
  "audio",
  "iframe",
  "object",
  "embed",
]);

function find_network_loads(container: HTMLElement): string[] {
  const loads: string[] = [];

  for (const element of Array.from(container.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("data-aster-parked-")) continue;
      if (element.localName === "a" && attribute.name === "href") continue;
      if (attribute.name === "src" && /^\s*data:/i.test(attribute.value)) {
        continue;
      }
      if (NETWORK_VALUE.test(attribute.value)) {
        loads.push(
          `${element.localName}[${attribute.name}]=${attribute.value}`,
        );
      }
    }
    if (element.localName === "style") {
      const css = (element.textContent ?? "").replace(
        /url\(\s*["']?data:/gi,
        "",
      );

      if (/url\(|image-set|https?:/i.test(css)) {
        loads.push(`style=${css}`);
      }
    }
    if (LOADING_TAGS.has(element.localName)) {
      loads.push(`tag=${element.localName}`);
    }
  }

  return loads;
}

function normalize_html(html: string): string {
  const template = document.createElement("template");

  template.innerHTML = html;

  const visit = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node as Element;
    const attributes = Array.from(element.attributes)
      .map(
        (attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`,
      )
      .sort()
      .join(" ");
    const children = Array.from(element.childNodes).map(visit).join("");

    return `<${element.localName} ${attributes}>${children}</${element.localName}>`;
  };

  return Array.from(template.content.childNodes).map(visit).join("");
}

const PROXY_URLS = [
  ["web", "/api/images/v1/proxy"],
  ["native", "https://app.astermail.org/api/images/v1/proxy"],
  ["onion", "http://exampleonionaddress.onion/api/images/v1/proxy"],
] as const;

describe.each(PROXY_URLS)(
  "blocked remote images in the forward editor (%s proxy)",
  (_label, proxy_url) => {
    beforeEach(() => {
      h.proxy_url = proxy_url;
    });

    afterEach(() => {
      h.proxy_url = DEFAULT_PROXY_URL;
    });

    it("loads nothing from the reported input", () => {
      const container = mount(DIOGO_INPUT, true);

      expect(find_network_loads(container)).toEqual([]);
      expect(container.innerHTML).not.toContain(` src="${proxy_url}`);
      expect(container.querySelector("table")!.hasAttribute("background")).toBe(
        false,
      );
      expect(container.querySelector("source")!.hasAttribute("srcset")).toBe(
        false,
      );
    });

    it("keeps the inline data image visible", () => {
      const container = mount(DIOGO_INPUT, true);
      const data_image = Array.from(container.querySelectorAll("img")).find(
        (image) => image.getAttribute("src")?.startsWith("data:"),
      );

      expect(data_image).toBeDefined();
    });

    it("loads nothing from styles, srcset, backgrounds or dropped tags", () => {
      const container = mount(RICH_INPUT, true);

      expect(find_network_loads(container)).toEqual([]);
      expect(container.textContent).toContain("styled");
      expect(container.querySelector("a")!.getAttribute("href")).toBe(
        "https://example.com/link",
      );
    });

    it("sends the same forward whether or not images were blocked", () => {
      for (const html of [DIOGO_INPUT, RICH_INPUT, forwarded]) {
        const blocked = read_editable_quoted_html(mount(html, true));
        const loaded = read_editable_quoted_html(mount(html, false));

        expect(normalize_html(blocked)).toBe(normalize_html(loaded));
        expect(blocked).not.toContain("data-aster-parked-");
      }
    });

    it("restores every parked source after the user edits the text", () => {
      const container = mount(RICH_INPUT, true);
      const loaded = read_editable_quoted_html(mount(RICH_INPUT, false));

      container.querySelector("b")!.textContent = "edited";

      const blocked = read_editable_quoted_html(container);

      expect(blocked).toContain("edited");
      expect(blocked).not.toContain("data-aster-parked-");
      expect(normalize_html(blocked)).toBe(
        normalize_html(loaded.replace("formatting", "edited")),
      );
      expect(find_network_loads(container)).toEqual([]);
    });

    it("sends the original address of a blocked remote image", () => {
      const result = read_editable_quoted_html(mount(DIOGO_INPUT, true));

      expect(result).toContain('src="https://evil.example/px?id=v"');
    });

    it("still loads remote images through the proxy when blocking is off", () => {
      const container = mount(DIOGO_INPUT, false);

      expect(container.querySelector("img")!.getAttribute("src")).toBe(
        `${proxy_url}?url=${encodeURIComponent("https://evil.example/px?id=v")}`,
      );
      expect(
        container.querySelector("table")!.getAttribute("background"),
      ).toContain(proxy_url);
    });
  },
);

describe("parked source restoration", () => {
  it("leaves text that looks like markup alone", () => {
    const container = mount(
      "<p>&lt;img data-aster-parked-src=&quot;x&quot;&gt;</p>",
      true,
    );
    const result = read_editable_quoted_html(container);

    expect(container.textContent).toContain('<img data-aster-parked-src="x">');
    expect(result).toContain("&lt;img data-aster-parked-src=");
  });

  it("restores a style block with quotes and ampersands exactly", () => {
    const html =
      '<style>.a { background: url("https://evil.example/a?b=1&c=2"); font-family: "Sans & Co"; }</style><p>x</p>';
    const blocked = read_editable_quoted_html(mount(html, true));
    const loaded = read_editable_quoted_html(mount(html, false));

    expect(normalize_html(blocked)).toBe(normalize_html(loaded));
  });
});
