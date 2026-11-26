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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
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
const { refresh_resolved_accent } = await import("@/lib/resolved_accent");

const PHARMACY_ORDER =
  '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">' +
  '<tr><td align="center"><table width="600" class="wrapper">' +
  '<tr><td><img src="" data-blocked="true" alt="Logo" width="160"></td></tr>' +
  '<tr><td style="font-weight:bold;color:#111111">Your order has shipped</td></tr>' +
  '<tr><td style="color:#111111">Order 1042 is on its way to you.</td></tr>' +
  '<tr><td><a href="https://shop.example.test/track">Track your order</a></td></tr>' +
  "</table></td></tr></table>";

const SIMPLE_NOTE =
  "<p>Thanks for the update.</p><p>See you on Thursday.</p>";

interface RenderedFrame {
  html_background: string;
  html_scheme: string;
  frame_background: string;
  frame_scheme: string;
  srcdoc: string;
}

function render_frame(html: string, body_background?: string): RenderedFrame {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SandboxedEmailRenderer
        body_background={body_background}
        email_id="msg-light-only-canvas"
        sanitized_html={html}
      />,
    );
  });

  const iframe = container.querySelector("iframe")!;
  const srcdoc = iframe.getAttribute("srcdoc") ?? "";
  const probe = document.createElement("iframe");

  document.body.appendChild(probe);
  const probe_doc = probe.contentDocument!;

  probe_doc.open();
  probe_doc.write(srcdoc);
  probe_doc.close();

  const html_style = probe.contentWindow!.getComputedStyle(
    probe_doc.documentElement,
  );
  const result: RenderedFrame = {
    html_background: as_rgb(html_style.getPropertyValue("background-color")),
    html_scheme: html_style.getPropertyValue("color-scheme").trim(),
    frame_background: as_rgb(iframe.style.backgroundColor),
    frame_scheme: iframe.style.colorScheme,
    srcdoc,
  };

  probe.remove();
  act(() => root.unmount());
  container.remove();

  return result;
}

function as_rgb(value: string): string {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());

  if (!hex) return value.trim();

  const [r, g, b] = hex.slice(1).map((part) => parseInt(part, 16));

  return `rgb(${r}, ${g}, ${b})`;
}

function is_transparent(value: string): boolean {
  return (
    value === "" ||
    value === "transparent" ||
    value.replace(/\s+/g, "") === "rgba(0,0,0,0)"
  );
}

beforeEach(() => {
  document.documentElement.classList.add("dark");
  refresh_resolved_accent();
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
  refresh_resolved_accent();
});

describe("SandboxedEmailRenderer light only canvas in the dark theme", () => {
  it("paints a white canvas inside the document of a light only layout", () => {
    const frame = render_frame(PHARMACY_ORDER);

    expect(frame.srcdoc).toContain(
      '<meta name="color-scheme" content="light only">',
    );
    expect(frame.html_background).toBe("rgb(255, 255, 255)");
    expect(frame.frame_background).toBe("rgb(255, 255, 255)");
    expect(frame.frame_scheme).toBe("light");
  });

  it("uses the designed body background as the document canvas", () => {
    const frame = render_frame(PHARMACY_ORDER, "#f4f4f4");

    expect(frame.html_background).toBe("rgb(244, 244, 244)");
    expect(frame.frame_background).toBe("rgb(244, 244, 244)");
  });

  it("leaves the canvas of an adapted simple email to the card", () => {
    const frame = render_frame(SIMPLE_NOTE);

    expect(frame.srcdoc).not.toContain(
      '<meta name="color-scheme" content="light only">',
    );
    expect(is_transparent(frame.html_background)).toBe(true);
    expect(frame.frame_scheme).toBe("dark");
  });
});
