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

const OUTLOOK_STYLE =
  '<style>p.MsoNormal, li.MsoNormal, div.MsoNormal { margin:0cm; font-size:11.0pt; font-family:"Calibri",sans-serif; }' +
  "a:link, span.MsoHyperlink { mso-style-priority:99; color:#0563C1; text-decoration:underline; }" +
  ".MsoChpDefault { mso-style-type:export-only; }</style>";

function outlook_email(word_html: string): string {
  return (
    OUTLOOK_STYLE +
    '<div class="WordSection1">' +
    '<p class="MsoNormal">Hi Sam,</p>' +
    '<p class="MsoNormal">&nbsp;</p>' +
    '<p class="MsoNormal">Thanks for sending the minutes over. The venue for next ' +
    `month is confirmed and the ${word_html} is in the shared folder.</p>` +
    '<p class="MsoNormal">Could you check the catering numbers before Friday? ' +
    "We still need the final count for the afternoon session.</p>" +
    '<p class="MsoNormal">&nbsp;</p>' +
    '<p class="MsoNormal">Best regards,</p>' +
    '<p class="MsoNormal">Alex</p>' +
    "</div>"
  );
}

function render_dark(sanitized_html: string, body_background?: string) {
  document.documentElement.classList.add("dark");

  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SandboxedEmailRenderer
        body_background={body_background}
        email_id="msg-designed-bg"
        sanitized_html={sanitized_html}
      />,
    );
  });

  const srcdoc =
    container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";

  act(() => root.unmount());
  container.remove();

  return srcdoc;
}

function renders_as_designed(
  sanitized_html: string,
  body_background?: string,
): boolean {
  const srcdoc = render_dark(sanitized_html, body_background);
  const html_tag = srcdoc.match(/<html\b[^>]*>/)?.[0] ?? "";

  return !html_tag.includes("color-scheme:dark");
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("SandboxedEmailRenderer designed background detection", () => {
  it("adapts a plain email whose only background is one white span", () => {
    expect(
      renders_as_designed(
        outlook_email('<span style="background:white">agenda</span>'),
      ),
    ).toBe(false);
  });

  it("adapts a plain email with a yellow highlighted word", () => {
    expect(
      renders_as_designed(
        outlook_email(
          '<span style="background:#FFFF00;mso-highlight:yellow">agenda</span>',
        ),
      ),
    ).toBe(false);
  });

  it("adapts highlights written with mark and font", () => {
    expect(
      renders_as_designed(
        outlook_email(
          '<mark style="background-color:rgb(255, 242, 0)">agenda</mark> ' +
            '<font style="background-color:#ffffff">notes</font>',
        ),
      ),
    ).toBe(false);
  });

  it("adapts a plain email with one short paragraph on a tinted background", () => {
    expect(
      renders_as_designed(
        outlook_email("agenda") +
          '<p class="MsoNormal" style="background:#f2f2f2">Sent from a mobile</p>',
      ),
    ).toBe(false);
  });

  it("keeps a table layout painted with bgcolor", () => {
    expect(
      renders_as_designed(
        '<table role="presentation" cellpadding="0" cellspacing="0">' +
          '<tr><td bgcolor="#f4f4f4" align="center">' +
          '<h1 style="font-size:24px">Spring collection</h1>' +
          "<p>New arrivals for the season are now in store.</p>" +
          "</td></tr></table>",
      ),
    ).toBe(true);
  });

  it("keeps an email with a coloured body background", () => {
    expect(
      renders_as_designed(
        "<p>Your weekly summary is ready.</p><p>Three new tasks were added.</p>",
        "#f4f4f4",
      ),
    ).toBe(true);
  });

  it("keeps an email whose content sits in a painted div", () => {
    expect(
      renders_as_designed(
        '<div style="background-color:#0b3d91;color:#ffffff">' +
          "<p>Your weekly summary is ready.</p><p>Three new tasks were added.</p>" +
          "</div>",
      ),
    ).toBe(true);
  });

  it("keeps a full-width coloured section", () => {
    expect(
      renders_as_designed(
        '<div style="background-color:#ffcc00;padding:24px;width:100%">Big sale</div>' +
          "<p>Everything in the spring range is reduced this weekend only, " +
          "with free delivery on orders over twenty pounds.</p>",
      ),
    ).toBe(true);
  });

  it("keeps a button styled on a link", () => {
    expect(
      renders_as_designed(
        "<p>Confirm your address to finish setting up the account.</p>" +
          '<p><a href="https://example.com/confirm" style="background-color:#2563eb;color:#ffffff;padding:12px 24px;display:inline-block">Confirm</a></p>',
      ),
    ).toBe(true);
  });

  it("does not treat a white body background as a design", () => {
    expect(renders_as_designed(outlook_email("agenda"), "#ffffff")).toBe(false);
  });
});
