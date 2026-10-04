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
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
const { preload_email_fonts } = await import("@/lib/email_font_sources");

const NOTE = "<p>Lunch on Friday works for me.</p>";
const WEIGHTS = [400, 500, 600, 700];

function render_srcdoc(email_id: string): string {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SandboxedEmailRenderer email_id={email_id} sanitized_html={NOTE} />,
    );
  });

  const srcdoc =
    container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";

  act(() => root.unmount());
  container.remove();

  return srcdoc;
}

function font_sources(srcdoc: string): string[] {
  return [
    ...srcdoc.matchAll(
      /@font-face\s*\{[^}]*font-family:\s*'Google Sans Flex'[^}]*src:\s*url\('([^']*)'\)/g,
    ),
  ].map((match) => match[1]);
}

function font_bytes(weight: number): Buffer {
  return readFileSync(
    join(process.cwd(), "public/fonts", `GoogleSansFlex-${weight}.woff2`),
  );
}

function app_font_file(weight: number): string {
  return new URL(`/fonts/GoogleSansFlex-${weight}.woff2`, window.location.href)
    .href;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe("SandboxedEmailRenderer body font", () => {
  it("falls back to the app's own font files on the desktop when they cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    const srcdoc = render_srcdoc("msg-font-desktop");

    await preload_email_fonts();

    expect(srcdoc).toContain('<base href="https://app.astermail.org/">');
    expect(font_sources(srcdoc)).toEqual(WEIGHTS.map(app_font_file));
    expect(font_sources(render_srcdoc("msg-font-desktop-2"))).toEqual(
      WEIGHTS.map(app_font_file),
    );
  });

  it("reads each font file once and inlines it into every later message", async () => {
    const fetch_font = vi.fn(async (url: string) => {
      const weight = Number(/-(\d+)\.woff2$/.exec(url)![1]);

      return new Response(new Uint8Array(font_bytes(weight)));
    });

    vi.stubGlobal("fetch", fetch_font);

    const first = render_srcdoc("msg-font-first");

    await preload_email_fonts();

    const later = ["msg-font-2", "msg-font-3", "msg-font-4"].map(render_srcdoc);

    expect(font_sources(first)).toEqual(WEIGHTS.map(app_font_file));
    for (const srcdoc of later) {
      expect(font_sources(srcdoc)).toEqual(
        WEIGHTS.map(
          (weight) =>
            `data:font/woff2;base64,${font_bytes(weight).toString("base64")}`,
        ),
      );
    }
    expect(fetch_font).toHaveBeenCalledTimes(WEIGHTS.length);
    expect(fetch_font.mock.calls).toEqual(
      WEIGHTS.map((weight) => [
        `/fonts/GoogleSansFlex-${weight}.woff2`,
        { cache: "force-cache" },
      ]),
    );
  });
});
