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
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      font_size_scale: 14,
      email_font_choice: "match_app",
      font_choice: "default",
      dyslexia_font: false,
      link_underlines: false,
      accent_color: "#2563eb",
      accent_color_hover: "#1d4ed8",
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
}));

vi.mock("@/components/email/reveal_on_fonts_ready", () => ({
  reveal_on_fonts_ready: () => () => {},
}));

const { SandboxedEmailRenderer } = await import(
  "@/components/email/sandboxed_email_renderer"
);

describe("SandboxedEmailRenderer", () => {
  it("keeps the same iframe element when the plain-text classification flips", () => {
    const container = document.createElement("div");

    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          is_plain_text
          email_id="msg-1"
          sanitized_html="<div>hello</div>"
        />,
      );
    });

    const first = container.querySelector("iframe");

    expect(first).not.toBeNull();

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          email_id="msg-1"
          is_plain_text={false}
          sanitized_html="<div>hello</div>"
        />,
      );
    });

    expect(container.querySelector("iframe")).toBe(first);

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          force_dark_mode
          email_id="msg-1"
          is_plain_text={false}
          sanitized_html="<div>hello</div>"
        />,
      );
    });

    expect(container.querySelector("iframe")).toBe(first);

    act(() => root.unmount());
    container.remove();
  });
});
