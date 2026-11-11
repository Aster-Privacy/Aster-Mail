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
//
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  create_deferred_image_session,
  DEFERRED_IMAGE_PLACEHOLDER,
  defer_proxied_images,
  type ProxiedImageLoader,
} from "./deferred_proxy_images";

vi.mock("@/lib/image_proxy_grant", () => ({
  fetch_proxied_image: vi.fn(),
}));

const proxy = "/api/images/v1/proxy";
const proxy_marker = "images/v1/proxy";

function proxied(source: string): string {
  return `${proxy}?url=${encodeURIComponent(source)}`;
}

function absolute(source: string): string {
  return new URL(proxied(source), window.location.href).href;
}

function load_document(html: string): Document {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = html;

  return doc;
}

function deferred_document(html: string): Document {
  return load_document(defer_proxied_images(html, proxy));
}

function png_loader(): ProxiedImageLoader {
  return vi.fn(async () => ({
    kind: "image" as const,
    bytes: new Uint8Array([137, 80, 78, 71]),
    content_type: "image/png",
  }));
}

describe("deferred proxied images", () => {
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    created = [];
    revoked = [];
    URL.createObjectURL = vi.fn(() => {
      const object_url = `blob:test/${created.length + 1}`;

      created.push(object_url);

      return object_url;
    });
    URL.revokeObjectURL = vi.fn((object_url: string) => {
      revoked.push(object_url);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves markup without proxied images unchanged", () => {
    const html = '<p>Hello</p><img src="data:image/png;base64,AAAA">';

    expect(defer_proxied_images(html, proxy)).toBe(html);
  });

  it("removes every live proxy reference from the markup", () => {
    const html = [
      `<img id="a" src="${proxied("https://a.example.test/a.png")}" alt="A">`,
      `<img id="b" srcset="${proxied("https://a.example.test/b1.png")} 1x, ${proxied("https://a.example.test/b2.png")} 2x">`,
      `<picture><source srcset="${proxied("https://a.example.test/c.webp")}"><img id="c" src="${proxied("https://a.example.test/c.png")}"></picture>`,
      `<table id="d" background="${proxied("https://a.example.test/d.png")}"><tr><td>x</td></tr></table>`,
      `<div id="e" style='background-image: url("${proxied("https://a.example.test/e.png")}")'>x</div>`,
      `<style>.f { background: url("${proxied("https://a.example.test/f.png")}") }</style>`,
      `<video id="g" poster="${proxied("https://a.example.test/g.png")}"></video>`,
    ].join("");
    const doc = deferred_document(html);

    doc.querySelectorAll("*").forEach((el) => {
      for (const name of ["src", "srcset", "background", "poster", "style"]) {
        expect(el.getAttribute(name) || "").not.toContain(`${proxy_marker}?`);
      }
    });
    expect(doc.querySelector("style")?.textContent).not.toContain(
      `${proxy_marker}?`,
    );
    expect(doc.querySelector("source")).toBeNull();
    expect(doc.getElementById("a")?.getAttribute("src")).toBe(
      DEFERRED_IMAGE_PLACEHOLDER,
    );
    expect(doc.getElementById("a")?.getAttribute("data-deferred-src")).toBe(
      absolute("https://a.example.test/a.png"),
    );
    expect(doc.getElementById("b")?.hasAttribute("srcset")).toBe(false);
    expect(
      doc.getElementById("b")?.getAttribute("data-deferred-src"),
    ).toContain(encodeURIComponent("https://a.example.test/b"));
    expect(
      doc.getElementById("d")?.getAttribute("data-deferred-background"),
    ).toBe(absolute("https://a.example.test/d.png"));
    expect(doc.getElementById("g")?.hasAttribute("poster")).toBe(false);
  });

  it("loads deferred images into object URLs and revokes them on dispose", async () => {
    const load = png_loader();
    const doc = deferred_document(
      `<img id="a" src="${proxied("https://a.example.test/a.png")}"><img id="b" src="${proxied("https://a.example.test/a.png")}"><div id="e" style='background-image: url("${proxied("https://a.example.test/e.png")}")'>x</div>`,
    );
    const session = create_deferred_image_session(proxy, { load });

    session.hydrate(doc);
    session.hydrate(doc);

    await vi.waitFor(() => {
      expect(doc.getElementById("a")?.getAttribute("src")).toMatch(
        /^blob:test\//,
      );
      expect(doc.getElementById("e")?.getAttribute("style")).toContain(
        "blob:test/",
      );
    });

    expect(doc.getElementById("b")?.getAttribute("src")).toBe(
      doc.getElementById("a")?.getAttribute("src"),
    );
    expect(load).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(2);
    expect(doc.getElementById("a")?.hasAttribute("data-deferred-src")).toBe(
      false,
    );
    expect(revoked).toEqual([]);

    session.dispose();

    expect([...revoked].sort()).toEqual([...created].sort());
  });

  it("inlines vector images instead of creating an object URL", async () => {
    const load: ProxiedImageLoader = vi.fn(async () => ({
      kind: "image" as const,
      bytes: new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ),
      content_type: "image/svg+xml",
    }));
    const doc = deferred_document(
      `<img id="a" src="${proxied("https://a.example.test/a.svg")}">`,
    );
    const session = create_deferred_image_session(proxy, { load });

    session.hydrate(doc);

    await vi.waitFor(() => {
      expect(doc.getElementById("a")?.getAttribute("src")).toMatch(
        /^data:image\/svg\+xml;base64,/,
      );
    });
    expect(created).toEqual([]);
    session.dispose();
  });

  it("refuses to display a response that is not an image", async () => {
    const load: ProxiedImageLoader = vi.fn(async () => ({
      kind: "image" as const,
      bytes: new TextEncoder().encode("<html></html>"),
      content_type: "text/html",
    }));
    const doc = deferred_document(
      `<img id="a" src="${proxied("https://a.example.test/a.png")}">`,
    );
    const session = create_deferred_image_session(proxy, { load });

    session.hydrate(doc);

    await vi.waitFor(() => {
      expect(doc.getElementById("a")?.getAttribute("data-load-failed")).toBe(
        "true",
      );
    });
    expect(created).toEqual([]);
    session.dispose();
  });

  it("uses the account path when the loader asks for a fallback", async () => {
    const load: ProxiedImageLoader = vi.fn(async () => ({
      kind: "fallback" as const,
    }));
    const doc = deferred_document(
      `<img id="a" src="${proxied("https://a.example.test/a.png")}"><div id="e" style='background-image: url("${proxied("https://a.example.test/e.png")}")'>x</div>`,
    );
    const session = create_deferred_image_session(proxy, { load });

    session.hydrate(doc);

    await vi.waitFor(() => {
      expect(doc.getElementById("a")?.getAttribute("src")).toBe(
        absolute("https://a.example.test/a.png"),
      );
      expect(doc.getElementById("e")?.getAttribute("style")).toContain(
        absolute("https://a.example.test/e.png"),
      );
    });
    expect(created).toEqual([]);
    session.dispose();
  });

  it("marks an image as failed without falling back on other errors", async () => {
    const load: ProxiedImageLoader = vi.fn(async () => ({
      kind: "failed" as const,
      retryable: true,
    }));
    const doc = deferred_document(
      `<img id="a" src="${proxied("https://a.example.test/a.png")}">`,
    );
    const session = create_deferred_image_session(proxy, {
      load,
      retry_delay_ms: 1,
    });

    session.hydrate(doc);

    await vi.waitFor(() => {
      expect(doc.getElementById("a")?.getAttribute("data-load-failed")).toBe(
        "true",
      );
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(doc.getElementById("a")?.hasAttribute("src")).toBe(false);
    session.dispose();
  });

  it("ignores deferred markers that arrive inside the message", async () => {
    const load = png_loader();
    const forged_marker = `${DEFERRED_IMAGE_PLACEHOLDER}#aster-deferred-00000000000000000000000000000000:${encodeURIComponent(absolute("https://a.example.test/forged.png"))}`;
    const doc = deferred_document(
      `<img id="a" src="data:image/gif;base64,AAAA" data-deferred-src="${proxied("https://a.example.test/forged.png")}"><div id="e" data-deferred-background="${proxied("https://a.example.test/forged.png")}" style='background-image: url("${forged_marker}")'>x</div>`,
    );

    expect(doc.getElementById("a")?.hasAttribute("data-deferred-src")).toBe(
      false,
    );
    expect(
      doc.getElementById("e")?.hasAttribute("data-deferred-background"),
    ).toBe(false);

    const session = create_deferred_image_session(proxy, { load });

    session.hydrate(doc);
    await new Promise((resume) => setTimeout(resume, 5));

    expect(load).not.toHaveBeenCalled();
    session.dispose();
  });

  it("never loads a deferred source that points away from the proxy", async () => {
    const load = png_loader();
    const doc = load_document(
      '<img id="a" data-deferred-src="https://other.example.test/a.png">',
    );
    const session = create_deferred_image_session(proxy, { load });

    session.hydrate(doc);
    await new Promise((resume) => setTimeout(resume, 5));

    expect(load).not.toHaveBeenCalled();
    expect(doc.getElementById("a")?.hasAttribute("data-deferred-src")).toBe(
      false,
    );
    session.dispose();
  });

  it("drops results that arrive after dispose", async () => {
    const control: { finish: (() => void) | null } = { finish: null };
    const load: ProxiedImageLoader = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ProxiedImageLoader>>>((resume) => {
          control.finish = () =>
            resume({
              kind: "image",
              bytes: new Uint8Array([1]),
              content_type: "image/png",
            });
        }),
    );
    const doc = deferred_document(
      `<img id="a" src="${proxied("https://a.example.test/a.png")}">`,
    );
    const session = create_deferred_image_session(proxy, { load });

    session.hydrate(doc);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    session.dispose();
    control.finish?.();
    await new Promise((resume) => setTimeout(resume, 5));

    expect(created).toEqual([]);
    expect(doc.getElementById("a")?.getAttribute("src")).toBe(
      DEFERRED_IMAGE_PLACEHOLDER,
    );
  });
});
