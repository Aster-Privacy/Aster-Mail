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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      font_size_scale: 14,
      email_font_choice: "match_app",
      font_choice: "default",
      dyslexia_font: false,
      link_underlines: false,
    },
  }),
  FONT_SIZE_DEFAULT: 14,
  normalize_font_size_scale: (value: number) => value,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { get_access_token: () => null },
}));

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: {
    get_method: () => "direct",
    get_api_onion_url: () => null,
  },
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/cid_resolver", () => ({
  extract_cid_references: () => [],
  resolve_cid_references: vi.fn(),
  revoke_cid_blob_urls: vi.fn(),
  strip_unresolved_cid_references: (html: string) => html,
}));

vi.mock("@/components/email/reveal_on_fonts_ready", () => ({
  reveal_on_fonts_ready: () => () => {},
}));

const { SandboxedEmailRenderer } =
  await import("@/components/email/sandboxed_email_renderer");
const { resolve_backdrop_color } =
  await import("@/components/email/sandboxed_email_renderer/helpers");
const { contrast_ratio } = await import("@/lib/email_ink");
const { LINK_INK_LAYER_ATTRIBUTE, LINK_INK_LAYER_CSS, MEASURING_ATTRIBUTE } =
  await import("@/lib/email_contrast_repair");
const { FORCED_DARK_CANVAS } = await import("@/lib/email_body_styles");

const NEWSLETTER =
  '<table width="600" bgcolor="#ffffff"><tr><td style="color:#222000">' +
  '<a href="https://news.example/bridge">Council approves the bridge</a>' +
  "</td></tr></table>";

const nested_roots: HTMLElement[] = [];

function nest(styles: string[]): HTMLElement {
  let parent: HTMLElement = document.body;

  for (const style of styles) {
    const child = document.createElement("div");

    child.setAttribute("style", style);
    parent.appendChild(child);
    if (parent === document.body) nested_roots.push(child);
    parent = child;
  }

  return parent;
}

afterEach(() => {
  nested_roots.splice(0).forEach((root) => root.remove());
});

describe("resolve_backdrop_color", () => {
  it("reads the card painted behind a transparent frame", () => {
    const frame = nest([
      "background-color: #121212",
      "background-color: #1f1f1f",
      "background-color: transparent",
      "",
    ]);

    expect(resolve_backdrop_color(frame, "#121212")).toBe("#1f1f1f");
  });

  it("composites a translucent layer over what is behind it", () => {
    const frame = nest([
      "background-color: #000000",
      "background-color: rgba(255, 255, 255, 0.5)",
    ]);

    expect(resolve_backdrop_color(frame, "#121212")).toBe("#808080");
  });

  it("prefers the canvas a forced dark frame paints for itself", () => {
    const frame = nest([
      "background-color: #ffffff",
      `background-color: ${FORCED_DARK_CANVAS}`,
    ]);

    expect(resolve_backdrop_color(frame, "#ffffff")).toBe(FORCED_DARK_CANVAS);
  });

  it("falls back to the app surface behind a gradient", () => {
    const frame = nest([
      "background-image: linear-gradient(#000000, #ffffff)",
      "",
    ]);

    expect(resolve_backdrop_color(frame, "#0b1120")).toBe("#0b1120");
  });
});

describe("SandboxedEmailRenderer hover rule", () => {
  it("stands down while the contrast repair measures", () => {
    const container = document.createElement("div");

    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          force_dark_mode
          email_id="msg-hover-scope"
          sanitized_html={NEWSLETTER}
        />,
      );
    });

    const srcdoc =
      container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";

    expect(srcdoc).toContain(
      `\na:not([style*="background" i]):where(:not([${MEASURING_ATTRIBUTE}])):hover, a:not([style*="background" i]):where(:not([${MEASURING_ATTRIBUTE}])):hover *`,
    );
    expect(srcdoc).not.toContain('\na:not([style*="background" i]):hover');

    act(() => root.unmount());
    container.remove();
  });
});

describe("SandboxedEmailRenderer forced dark in the light theme", () => {
  it("derives the link ink for the dark canvas it paints", () => {
    document.documentElement.classList.remove("dark");

    const container = document.createElement("div");

    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          force_dark_mode
          email_id="msg-forced-light"
          sanitized_html={NEWSLETTER}
        />,
      );
    });

    const iframe = container.querySelector("iframe")!;
    const srcdoc = iframe.getAttribute("srcdoc") ?? "";
    const link_rule = srcdoc.match(
      /a:not\(\[style\*="background" i\]\):not\(\[data-aster-keep-bg\]\), [^{]*\{ color: (#[0-9a-f]{6}); \}/,
    );

    expect(link_rule).not.toBeNull();
    expect(
      contrast_ratio(link_rule![1], FORCED_DARK_CANVAS),
    ).toBeGreaterThanOrEqual(4.5);
    expect(srcdoc).toContain(
      `html { background-color: ${FORCED_DARK_CANVAS} !important; }`,
    );
    expect(srcdoc).toContain(
      `<style ${LINK_INK_LAYER_ATTRIBUTE}>${LINK_INK_LAYER_CSS}</style>`,
    );
    expect(srcdoc.indexOf(LINK_INK_LAYER_CSS)).toBeLessThan(
      srcdoc.indexOf("<body"),
    );

    act(() => root.unmount());
    container.remove();
  });
});
