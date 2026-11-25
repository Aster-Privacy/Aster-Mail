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
import { createRoot, type Root } from "react-dom/client";

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
const { FORCED_DARK_CANVAS } = await import("@/lib/email_body_styles");

const PLAIN_NOTE =
  "Three cover options are attached. My favorite is the second one.";
const NEWSLETTER =
  '<table width="600" bgcolor="#ffffff"><tr><td style="color:#222000">' +
  "Council approves the bridge</td></tr></table>";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function mount(): { root: Root; container: HTMLElement } {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const entry = { root: createRoot(container), container };

  mounted.push(entry);

  return entry;
}

async function set_app_dark(value: boolean) {
  await act(async () => {
    document.documentElement.classList.toggle("dark", value);
    document.documentElement.classList.toggle("light", !value);
    refresh_resolved_accent();
  });
}

function frame_of(container: HTMLElement): HTMLIFrameElement {
  return container.querySelector("iframe")!;
}

function scheme_of_document(srcdoc: string): "dark" | "light" {
  return /<html style="color-scheme:dark !important"/.test(srcdoc)
    ? "dark"
    : "light";
}

beforeEach(async () => {
  await set_app_dark(false);
});

afterEach(async () => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
  await set_app_dark(false);
});

describe("SandboxedEmailRenderer when dark mode resolves after the first render", () => {
  it.each([
    ["a plain message", PLAIN_NOTE, true],
    ["a newsletter", NEWSLETTER, false],
  ])(
    "keeps %s on the card backdrop once forced dark settles",
    async (_label, html, is_plain_text) => {
      const { root, container } = mount();

      act(() => {
        root.render(
          <SandboxedEmailRenderer
            email_id="msg-late-dark"
            is_plain_text={is_plain_text}
            sanitized_html={html}
          />,
        );
      });

      await set_app_dark(true);

      act(() => {
        root.render(
          <SandboxedEmailRenderer
            force_dark_mode
            email_id="msg-late-dark"
            is_plain_text={is_plain_text}
            sanitized_html={html}
          />,
        );
      });

      const iframe = frame_of(container);
      const srcdoc = iframe.getAttribute("srcdoc") ?? "";

      expect(srcdoc).not.toContain(FORCED_DARK_CANVAS);
      expect(iframe.style.backgroundColor).toBe("transparent");
      expect(scheme_of_document(srcdoc)).toBe("dark");
      expect(iframe.style.colorScheme).toBe("dark");
    },
  );

  it("drops the forced canvas when the dark class lands after the props", async () => {
    const { root, container } = mount();

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          force_dark_mode
          email_id="msg-class-late"
          sanitized_html={NEWSLETTER}
        />,
      );
    });

    await set_app_dark(true);

    const iframe = frame_of(container);
    const srcdoc = iframe.getAttribute("srcdoc") ?? "";

    expect(srcdoc).not.toContain(FORCED_DARK_CANVAS);
    expect(iframe.style.backgroundColor).toBe("transparent");
    expect(iframe.style.colorScheme).toBe("dark");
  });

  it("matches the frame scheme to a light document", async () => {
    const { root, container } = mount();

    await set_app_dark(true);

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          email_id="msg-light-doc"
          sanitized_html={NEWSLETTER}
        />,
      );
    });

    const iframe = frame_of(container);

    expect(scheme_of_document(iframe.getAttribute("srcdoc") ?? "")).toBe(
      "light",
    );
    expect(iframe.style.colorScheme).toBe("light");
  });

  it("keeps the frame scheme on the dark document after a theme flip", async () => {
    const { root, container } = mount();

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          email_id="msg-flip"
          is_plain_text
          sanitized_html={PLAIN_NOTE}
        />,
      );
    });

    expect(frame_of(container).style.colorScheme).toBe("light");

    await set_app_dark(true);

    const iframe = frame_of(container);

    expect(scheme_of_document(iframe.getAttribute("srcdoc") ?? "")).toBe(
      "dark",
    );
    expect(iframe.style.colorScheme).toBe("dark");
  });
});
