//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      block_external_content: true,
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
  use_i18n: () => ({ t: (key: string) => key, is_rtl: false }),
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
const { set_cached_iframe_height } =
  await import("@/components/email/sandboxed_email_renderer/helpers");
const { TrackingProtectionShield } =
  await import("@/components/email/tracking_protection_shield");

const PIXEL_URL = "https://open.mailmetrics.example/o/1.gif?uid=reader-7f3a91";

const REPORT: ExternalContentReport = {
  has_remote_images: true,
  has_remote_fonts: false,
  has_remote_css: false,
  has_tracking_pixels: true,
  blocked_count: 1,
  blocked_items: [{ url: PIXEL_URL, type: "tracking_pixel" }],
  cleaned_links: [],
};

function frame_box(left: number, top: number) {
  return {
    left,
    top,
    width: 1,
    height: 1,
    right: left + 1,
    bottom: top + 1,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

async function next_frames() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

describe("blocked tracking pixels in the message body", () => {
  it("draws no markers over the email while the tracker list is open", async () => {
    const container = document.createElement("div");

    document.body.appendChild(container);
    const root = createRoot(container);

    set_cached_iframe_height("msg-pixels", 400);

    act(() => {
      root.render(
        <>
          <TrackingProtectionShield report={REPORT} />
          <SandboxedEmailRenderer
            email_id="msg-pixels"
            sanitized_html={`<p>Weekly news</p><img data-blocked="true" data-tracking-pixel="true" data-original-src="${PIXEL_URL}" src="data:image/svg+xml,placeholder" width="1" height="1" alt="">`}
          />
        </>,
      );
    });

    const iframe = container.querySelector("iframe")!;
    const doc = iframe.contentDocument!;
    const pixel = doc.createElement("img");

    pixel.setAttribute("data-blocked", "true");
    pixel.setAttribute("data-tracking-pixel", "true");
    pixel.setAttribute("src", "data:image/svg+xml,placeholder");
    pixel.getBoundingClientRect = () => frame_box(120, 80);
    pixel.getClientRects = () => [frame_box(120, 80)] as unknown as DOMRectList;
    doc.body.appendChild(pixel);

    const trigger = container.querySelector("button")!;
    const init = { bubbles: true, cancelable: true, button: 0 };

    act(() => {
      trigger.dispatchEvent(new PointerEvent("pointerover", init));
      trigger.dispatchEvent(
        new PointerEvent("pointerdown", { ...init, pointerType: "mouse" }),
      );
      trigger.dispatchEvent(new MouseEvent("click", init));
    });
    await next_frames();

    expect(document.querySelector("[role='dialog']")).not.toBeNull();
    expect(
      document.querySelectorAll(
        "[data-tracking-pixel-marker], [data-tracking-pixel-dot], [data-testid='tracking-pixel-markers']",
      ),
    ).toHaveLength(0);
    expect(
      doc.querySelectorAll(
        "[data-tracking-pixel-marker], [data-tracking-pixel-dot]",
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(
        "[aria-label='common.tracking_pixel_blocked']",
      ),
    ).toHaveLength(0);

    act(() => root.unmount());
    container.remove();
  });
});
