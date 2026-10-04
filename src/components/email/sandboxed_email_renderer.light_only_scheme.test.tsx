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

const LIGHT_ONLY_NEWSLETTER =
  "<style>:root { color-scheme: only light !important }</style>" +
  '<table width="100%" style="color-scheme: only light">' +
  '<tr><td bgcolor="#d3d5d9" style="background-color: #D3D5D9">' +
  '<table width="600"><tr><td style="background-color: #FFFFFF">' +
  '<h2 style="color: #000000">Big changes coming to your account</h2>' +
  "<p>No action is needed on your end.</p>" +
  "</td></tr></table></td></tr></table>";

const LIGHT_ONLY_NOTE =
  "<style>:root { color-scheme: only light !important }</style>" +
  "<div><p>Use the code below to finish signing in.</p></div>";

const LIGHT_ROOT_NOTE =
  "<style>:root { color-scheme: light !important }</style>" +
  "<div><p>Use the code below to finish signing in.</p></div>";

function render_root_scheme(
  html: string,
  force_dark_mode: boolean,
): { scheme: string; srcdoc: string } {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SandboxedEmailRenderer
        email_id={`msg-light-only-${force_dark_mode ? "forced" : "auto"}`}
        force_dark_mode={force_dark_mode}
        sanitized_html={html}
      />,
    );
  });

  const srcdoc =
    container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";
  const probe = document.createElement("iframe");

  document.body.appendChild(probe);
  const probe_doc = probe.contentDocument!;

  probe_doc.open();
  probe_doc.write(srcdoc);
  probe_doc.close();

  const scheme = probe
    .contentWindow!.getComputedStyle(probe_doc.documentElement)
    .getPropertyValue("color-scheme")
    .trim();

  probe.remove();
  act(() => root.unmount());
  container.remove();

  return { scheme, srcdoc };
}

beforeEach(() => {
  document.documentElement.classList.add("dark");
  refresh_resolved_accent();
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
  refresh_resolved_accent();
});

describe("SandboxedEmailRenderer emails that declare a light only scheme", () => {
  it("keeps the frame dark when dark mode is forced on a light only email", () => {
    const { scheme } = render_root_scheme(LIGHT_ONLY_NEWSLETTER, true);

    expect(scheme).toBe("dark");
  });

  it("shows a simple light only email light in the dark theme", () => {
    const { scheme, srcdoc } = render_root_scheme(LIGHT_ONLY_NOTE, false);

    expect(srcdoc).toContain('<meta name="color-scheme" content="light only">');
    expect(srcdoc).not.toContain("html { color-scheme: dark !important; }");
    expect(scheme).not.toBe("dark");
  });

  it("keeps the frame dark when automatic dark mode meets a light root", () => {
    const { scheme, srcdoc } = render_root_scheme(LIGHT_ROOT_NOTE, false);

    expect(srcdoc).toContain("html { color-scheme: dark !important; }");
    expect(scheme).toBe("dark");
  });
});
