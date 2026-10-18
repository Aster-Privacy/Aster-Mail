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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
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
  strip_unresolved_cid_references: (html: string) => html,
}));

vi.mock("@/lib/email_font_sources", () => ({
  preload_email_fonts: () => Promise.resolve(),
  email_font_src: () => "/fonts/test.woff2",
}));

const pending_reveals: Array<() => void> = [];

vi.mock("@/components/email/reveal_on_fonts_ready", () => ({
  reveal_on_fonts_ready: (_fonts: unknown, reveal: () => void) => {
    pending_reveals.push(reveal);

    return () => {};
  },
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BODY_HEIGHT = 240;

const { SandboxedEmailRenderer, set_cached_iframe_height } =
  await import("@/components/email/sandboxed_email_renderer");
const { clear_iframe_height_cache, CONTENT_READY_FALLBACK_MS } =
  await import("@/components/email/sandboxed_email_renderer/helpers");

describe("sandboxed renderer waits for fonts before revealing", () => {
  let container: HTMLDivElement;

  const frame = () => container.querySelector("iframe");

  const mount = (email_id: string) => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <SandboxedEmailRenderer
          is_plain_text
          email_id={email_id}
          sanitized_html="hello there"
        />,
      );
    });

    act(() => {
      vi.advanceTimersByTime(60);
    });

    return root;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clear_iframe_height_cache();
    pending_reveals.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const bottom = this.tagName === "BODY" ? BODY_HEIGHT : 0;

        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          width: 0,
          height: bottom,
          bottom,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps the body invisible until the font wait releases it", () => {
    const root = mount("msg-first-open");

    expect(pending_reveals).toHaveLength(1);
    expect(frame()?.style.opacity).toBe("0");

    act(() => {
      pending_reveals[0]!();
    });

    expect(frame()?.style.opacity).toBe("1");
    expect(frame()?.style.height).toBe(`${BODY_HEIGHT + 8}px`);

    act(() => root.unmount());
  });

  it("keeps a cached height hidden until the content is in place", () => {
    set_cached_iframe_height("msg-reopen", BODY_HEIGHT + 8);
    const root = mount("msg-reopen");

    expect(frame()?.style.height).toBe(`${BODY_HEIGHT + 8}px`);
    expect(frame()?.style.opacity).toBe("0");

    act(() => {
      pending_reveals[0]!();
    });

    expect(frame()?.style.opacity).toBe("1");

    act(() => root.unmount());
  });

  it("reveals on the fallback timer when the font wait never fires", () => {
    const root = mount("msg-stuck");

    expect(frame()?.style.opacity).toBe("0");

    act(() => {
      vi.advanceTimersByTime(CONTENT_READY_FALLBACK_MS + 20);
    });

    expect(frame()?.style.opacity).toBe("1");

    act(() => root.unmount());
  });
});
