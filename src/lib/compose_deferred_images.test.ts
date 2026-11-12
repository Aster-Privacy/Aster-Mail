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

const h = vi.hoisted(() => ({
  defer: true,
  proxy_url: "https://app.example/api/images/v1/proxy",
}));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/image_proxy")>()),
  get_image_proxy_url: () => h.proxy_url,
}));

vi.mock("@/lib/image_proxy_grant", () => ({
  fetch_proxied_image: vi.fn(async () => ({ kind: "fallback" as const })),
  should_defer_proxied_images: () => h.defer,
}));

import {
  attach_compose_image_hydration,
  defer_compose_images,
  restore_deferred_compose_images,
  set_compose_image_session_factory,
} from "@/lib/compose_deferred_images";
import {
  COMPOSE_DEFERRED_SRC_ATTRIBUTE,
  COMPOSE_IMAGE_PLACEHOLDER,
} from "@/lib/compose_deferred_markup";
import { proxy_compose_image_sources } from "@/lib/compose_image_sources";
import {
  create_deferred_image_session,
  type ProxiedImageLoader,
} from "@/lib/deferred_proxy_images";
import {
  build_editable_quoted_fragment,
  read_compose_editor_html,
} from "@/lib/editable_quoted_html";
import { sanitize_compose_paste } from "@/lib/html_sanitizer";
import { purify_outgoing_html } from "@/lib/html_sanitizer_compose";

const REMOTE = "https://a.example.test/pic.png?x=1&y=it's";
const DEFERRED_PREFIX = "data-aster-deferred-";

function proxied(source: string): string {
  return `${h.proxy_url}?url=${encodeURIComponent(source)}`;
}

function in_attribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function serialized(html: string): string {
  const template = document.createElement("template");

  template.innerHTML = html;

  return template.innerHTML;
}

function png_loader(): ProxiedImageLoader {
  return vi.fn(async () => ({
    kind: "image" as const,
    bytes: new Uint8Array([137, 80, 78, 71]),
    content_type: "image/png",
  }));
}

function use_loader(load: ProxiedImageLoader): void {
  set_compose_image_session_factory((proxy_url) =>
    create_deferred_image_session(proxy_url, { load, retry_delay_ms: 1 }),
  );
}

function mount(html: string): HTMLDivElement {
  const editor = document.createElement("div");

  editor.innerHTML = html;
  document.body.appendChild(editor);

  return editor;
}

const image_html = `<p>Hello</p><img alt="one" src="${in_attribute(proxied(REMOTE))}" width="20">`;
const background_html = `<table background="${in_attribute(proxied(REMOTE))}"><tbody><tr><td>cell</td></tr></tbody></table>`;
const inline_style_html = `<div style="color: red; background-image: url(&quot;${in_attribute(proxied(REMOTE))}&quot;)">styled</div>`;
const style_block_html = `<style>.a { background: url("${proxied(REMOTE)}"); }</style><div class="a">block</div>`;
const mixed_html =
  image_html +
  background_html +
  inline_style_html +
  style_block_html +
  `<img src="cid:part1@example"><img src="data:image/png;base64,AAAA"><img src="${in_attribute(proxied("https://b.example.test/second.gif"))}">`;

let created: string[] = [];
let revoked: string[] = [];
let mounted: HTMLElement[] = [];

beforeEach(() => {
  h.defer = true;
  created = [];
  revoked = [];
  mounted = [];
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => {
        const url = `blob:https://app.example/${created.length + 1}`;

        created.push(url);

        return url;
      },
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    }),
  );
});

afterEach(() => {
  mounted.forEach((element) => element.remove());
  set_compose_image_session_factory(null);
  vi.unstubAllGlobals();
});

function mount_editor(html: string): HTMLDivElement {
  const editor = mount(html);

  mounted.push(editor);

  return editor;
}

describe("compose editor images", () => {
  it.each([
    ["an image", image_html],
    ["a background attribute", background_html],
    ["an inline style", inline_style_html],
    ["a style block", style_block_html],
    ["mixed content", mixed_html],
  ])("keeps %s off the page until it is loaded", (_name, original) => {
    const editor_html = defer_compose_images(original);
    const editor = mount_editor(editor_html);

    expect(editor_html).not.toBe(original);
    editor.querySelectorAll("img").forEach((image) => {
      expect(image.getAttribute("src") ?? "").not.toContain("images/v1/proxy");
    });
    editor.querySelectorAll("[background]").forEach((element) => {
      expect(element.getAttribute("background")).not.toContain(
        "images/v1/proxy",
      );
    });
    editor.querySelectorAll("[style]").forEach((element) => {
      expect(element.getAttribute("style")).not.toContain("url(\"https");
    });
    expect(restore_deferred_compose_images(editor_html)).toBe(original);
    expect(defer_compose_images(editor_html)).toBe(editor_html);
  });

  it.each([
    ["an image", image_html],
    ["a background attribute", background_html],
    ["an inline style", inline_style_html],
    ["a style block", style_block_html],
    ["mixed content", mixed_html],
  ])(
    "round trips %s through the editor and back to the original",
    async (_name, original) => {
      const load = png_loader();

      use_loader(load);

      const editor = mount_editor(defer_compose_images(original));
      const release = attach_compose_image_hydration(editor);

      await vi.waitFor(() => {
        expect(editor.innerHTML).toContain("blob:https://app.example/");
        expect(editor.innerHTML).not.toContain(
          `${COMPOSE_IMAGE_PLACEHOLDER}"`,
        );
        expect(editor.innerHTML).not.toContain(
          `${COMPOSE_IMAGE_PLACEHOLDER}#`,
        );
      });

      const hydrated = editor.innerHTML;
      const restored = restore_deferred_compose_images(hydrated);

      expect(restored).toBe(serialized(original));
      expect(restored).not.toContain(DEFERRED_PREFIX);
      expect(restored).not.toContain("blob:");
      expect(restored).not.toContain(COMPOSE_IMAGE_PLACEHOLDER);
      expect(read_compose_editor_html(hydrated)).toBe(
        read_compose_editor_html(serialized(original)),
      );

      release();
    },
  );

  it("sends the original remote address for a loaded image", async () => {
    use_loader(png_loader());

    const editor = mount_editor(defer_compose_images(image_html));
    const release = attach_compose_image_hydration(editor);

    await vi.waitFor(() => {
      expect(editor.querySelector("img")?.getAttribute("src")).toMatch(
        /^blob:/,
      );
    });

    const read = read_compose_editor_html(editor.innerHTML);

    expect(read).toBe(
      `<p>Hello</p><img alt="one" src="${in_attribute(REMOTE)}" width="20">`,
    );
    release();
  });

  it("leaves inline and embedded images alone", () => {
    const html =
      '<img src="cid:part1@example"><img src="data:image/png;base64,AAAA"><img src="https://a.example.test/direct.png"><p style="color: red">x</p>';

    expect(defer_compose_images(html)).toBe(html);
    expect(restore_deferred_compose_images(html)).toBe(html);
  });

  it("leaves blocked sources parked", () => {
    const html = `<img data-aster-parked-src="${in_attribute(proxied(REMOTE))}" alt="blocked">`;

    expect(defer_compose_images(html)).toBe(html);
  });

  it("defers an image that only has a candidate list", () => {
    const html = `<img srcset="${in_attribute(proxied(REMOTE))} 2x" alt="wide">`;
    const editor_html = defer_compose_images(html);

    expect(editor_html).toContain(`${DEFERRED_PREFIX}srcset=`);
    expect(editor_html).not.toMatch(/\ssrcset=/);
    expect(restore_deferred_compose_images(editor_html)).toBe(html);
  });

  it("does nothing where images load directly", () => {
    h.defer = false;

    expect(defer_compose_images(mixed_html)).toBe(mixed_html);
  });

  it("keeps the original when an image cannot be loaded", async () => {
    const load: ProxiedImageLoader = vi.fn(async () => ({
      kind: "failed" as const,
      retryable: false,
    }));

    use_loader(load);

    const editor = mount_editor(defer_compose_images(image_html));
    const release = attach_compose_image_hydration(editor);

    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    await Promise.resolve();

    expect(editor.querySelector("img")?.getAttribute("src")).toBe(
      COMPOSE_IMAGE_PLACEHOLDER,
    );
    expect(restore_deferred_compose_images(editor.innerHTML)).toBe(
      serialized(image_html),
    );
    release();
  });

  it("loads images that arrive after the editor is attached", async () => {
    const load = png_loader();

    use_loader(load);

    const editor = mount_editor("<p>typed</p>");
    const release = attach_compose_image_hydration(editor);

    editor.insertAdjacentHTML("beforeend", defer_compose_images(image_html));

    await vi.waitFor(() => {
      expect(editor.querySelector("img")?.getAttribute("src")).toMatch(
        /^blob:/,
      );
    });
    expect(load).toHaveBeenCalledTimes(1);
    release();
  });

  it("asks once for an address used by several elements", async () => {
    const load = png_loader();

    use_loader(load);

    const editor = mount_editor(
      defer_compose_images(image_html + image_html + inline_style_html),
    );
    const release = attach_compose_image_hydration(editor);

    await vi.waitFor(() => {
      editor.querySelectorAll("img").forEach((image) => {
        expect(image.getAttribute("src")).toMatch(/^blob:/);
      });
      expect(editor.querySelector("div")?.getAttribute("style")).toContain(
        "blob:",
      );
    });
    expect(load).toHaveBeenCalledTimes(1);
    release();
  });

  it("takes loaded images off the page when the last holder lets go", async () => {
    use_loader(png_loader());

    const editor = mount_editor(defer_compose_images(mixed_html));
    const release_one = attach_compose_image_hydration(editor);
    const release_two = attach_compose_image_hydration(editor);

    await vi.waitFor(() => {
      expect(created.length).toBe(2);
      expect(editor.innerHTML).not.toContain(`${COMPOSE_IMAGE_PLACEHOLDER}#`);
    });

    release_one();
    expect(editor.innerHTML).toContain("blob:");
    expect(revoked).toEqual([]);

    release_two();
    release_two();
    expect(editor.innerHTML).not.toContain("blob:");
    expect([...revoked].sort()).toEqual([...created].sort());
    expect(restore_deferred_compose_images(editor.innerHTML)).toBe(
      serialized(mixed_html),
    );
  });

  it("restores a loaded image that is pasted back in", async () => {
    use_loader(png_loader());

    const editor = mount_editor(defer_compose_images(image_html));
    const release = attach_compose_image_hydration(editor);

    await vi.waitFor(() => {
      expect(editor.querySelector("img")?.getAttribute("src")).toMatch(
        /^blob:/,
      );
    });

    const copied = editor.innerHTML;
    const pasted = proxy_compose_image_sources(
      sanitize_compose_paste(restore_deferred_compose_images(copied), {
        collapse_source_whitespace: true,
      }),
    );

    expect(pasted).toContain(in_attribute(proxied(REMOTE)));
    expect(pasted).not.toContain("blob:");
    expect(pasted).not.toContain(DEFERRED_PREFIX);

    const again = defer_compose_images(pasted);

    expect(again).toContain(COMPOSE_DEFERRED_SRC_ATTRIBUTE);
    expect(read_compose_editor_html(again)).toContain(
      `src="${in_attribute(REMOTE)}"`,
    );
    release();
  });

  it("never lets editor markup reach an outgoing message", async () => {
    use_loader(png_loader());

    const editor = mount_editor(defer_compose_images(mixed_html));
    const release = attach_compose_image_hydration(editor);

    await vi.waitFor(() => {
      expect(created.length).toBe(2);
      expect(editor.innerHTML).not.toContain(`${COMPOSE_IMAGE_PLACEHOLDER}#`);
    });

    const outgoing = purify_outgoing_html(editor.innerHTML);

    expect(outgoing).not.toContain(DEFERRED_PREFIX);
    expect(outgoing).not.toContain("blob:");
    expect(outgoing).not.toContain(COMPOSE_IMAGE_PLACEHOLDER);
    expect(outgoing).not.toContain("aster-compose-");
    expect(outgoing).toBe(purify_outgoing_html(serialized(mixed_html)));
    release();
  });

  it("defers proxied images in an editable quote", async () => {
    use_loader(png_loader());

    const source = `<p>quoted</p><img alt="q" src="${in_attribute(REMOTE)}">`;
    const editor = mount_editor("");

    editor.replaceChildren(
      build_editable_quoted_fragment(source, { block_remote_images: false }),
    );

    const image = editor.querySelector("img");

    expect(image?.getAttribute("src")).toBe(COMPOSE_IMAGE_PLACEHOLDER);
    expect(image?.getAttribute(COMPOSE_DEFERRED_SRC_ATTRIBUTE)).toBe(
      proxied(REMOTE),
    );

    const release = attach_compose_image_hydration(editor);

    await vi.waitFor(() => {
      expect(image?.getAttribute("src")).toMatch(/^blob:/);
    });
    expect(read_compose_editor_html(editor.innerHTML)).toContain(
      `src="${in_attribute(REMOTE)}"`,
    );
    expect(read_compose_editor_html(editor.innerHTML)).not.toContain("blob:");
    release();
  });
});
