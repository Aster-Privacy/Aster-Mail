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
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      default_reply_behavior: "reply",
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

vi.mock("@/lib/cid_resolver", () => ({
  extract_cid_references: () => [],
  resolve_cid_references: vi.fn(),
  revoke_cid_blob_urls: vi.fn(),
  strip_unresolved_cid_references: (html: string) => html,
}));

vi.mock("@/components/email/reveal_on_fonts_ready", () => ({
  reveal_on_fonts_ready: (_fonts: unknown, reveal: () => void) => {
    reveal();

    return () => {};
  },
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

vi.mock("@/components/email/tracking_protection_shield", () => ({
  TrackingProtectionShield: () => null,
}));

vi.mock("@/components/ui/email_tag", () => ({
  EmailTag: () => null,
  hex_to_variant: () => "neutral",
}));

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({ get_tag_by_token: () => undefined }),
}));

vi.mock("@/components/email/use_email_viewer", () => ({
  use_email_viewer: () => viewer,
}));

vi.mock("@/components/email/viewer_shared", async () => {
  const { SandboxedEmailRenderer } =
    await import("@/components/email/sandboxed_email_renderer");

  return {
    ViewerToolbarActions: () => null,
    ViewerThreadContent: () =>
      viewer.is_loading
        ? null
        : React.createElement(SandboxedEmailRenderer, {
            is_plain_text: true,
            email_id: viewer.email.id,
            sanitized_html: "<p>Hello</p>",
          }),
    ViewerErrorState: () => null,
    get_external_content_mode: () => null,
    set_external_content_mode: () => {},
  };
});

vi.mock("@/components/email/use_spam_confirm", () => ({
  use_spam_confirm: () => ({
    request_spam: () => {},
    spam_confirm_dialog: null,
  }),
}));

vi.mock("@/services/forward_store", () => ({
  set_forward_mail_id: () => {},
}));

vi.mock("@/stores/label_hints_store", () => ({
  get_label_hints: () => [],
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  execute_unsubscribe: vi.fn(),
  get_manual_unsubscribe_url: () => null,
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: () => {},
}));

vi.mock("@/hooks/use_unsubscribed_senders", () => ({
  persist_unsubscribe: () => {},
  use_unsubscribed_senders: () => ({
    is_unsubscribed: () => false,
    mark_unsubscribed: () => {},
  }),
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/utils/open_link", () => ({
  open_external: () => {},
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMAIL_ID = "email-1";
const BODY_HEIGHT = 320;

const viewer = {
  email: {
    id: EMAIL_ID,
    sender: "Harbor Weekly",
    sender_email: "digest@harbor-weekly.example",
    subject: "This week's highlights",
    preview: "",
    timestamp: "2026-09-30T13:21:00.000Z",
    is_read: true,
    is_starred: false,
    is_trashed: false,
    is_archived: false,
    body: "<p>Hello</p>",
    to: [],
    cc: [],
    bcc: [],
  },
  mail_item: null,
  error: null,
  is_loading: true,
  is_content_current: true,
  thread_messages: [],
  thread_list_ref: { current: null },
};

const { SplitEmailViewer } = await import("./split_email_viewer");
const { FullEmailViewer } = await import("./full_email_viewer");
const { CONTENT_READY_FALLBACK_MS, clear_iframe_height_cache } =
  await import("@/components/email/sandboxed_email_renderer/helpers");
const { set_cached_iframe_height } =
  await import("@/components/email/sandboxed_email_renderer");

const VIEWERS = [
  {
    name: "split",
    render: () => <SplitEmailViewer email_id={EMAIL_ID} on_close={() => {}} />,
  },
  {
    name: "full",
    render: () => <FullEmailViewer email_id={EMAIL_ID} on_back={() => {}} />,
  },
];

describe.each(VIEWERS)("$name viewer loading skeleton", ({ render }) => {
  let container: HTMLDivElement;
  let root: Root;
  let ready_events: string[];

  const on_ready = (event: Event) => {
    ready_events.push((event as CustomEvent<string>).detail);
  };

  const skeleton = () => container.querySelector('[aria-busy="true"]');
  const body_frame = () => container.querySelector("iframe");

  const show_body = () => {
    viewer.is_loading = false;
    act(() => {
      root.render(render());
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clear_iframe_height_cache();
    viewer.is_loading = true;
    ready_events = [];
    window.addEventListener("astermail:iframe-ready", on_ready);
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(render());
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.removeEventListener("astermail:iframe-ready", on_ready);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("drops the skeleton on the ready event when the height cache fills after the viewer opened", () => {
    expect(skeleton()).not.toBeNull();

    set_cached_iframe_height(EMAIL_ID, BODY_HEIGHT);
    show_body();

    act(() => {
      vi.advanceTimersByTime(CONTENT_READY_FALLBACK_MS / 2);
    });

    expect(body_frame()?.style.opacity).toBe("1");
    expect(ready_events).toEqual([EMAIL_ID]);
    expect(skeleton()).toBeNull();
  });

  it("signals ready in the same step that reveals the body", () => {
    expect(skeleton()).not.toBeNull();

    show_body();

    expect(body_frame()?.style.opacity).toBe("1");
    expect(ready_events).toEqual([EMAIL_ID]);
    expect(skeleton()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(CONTENT_READY_FALLBACK_MS * 2);
    });

    expect(ready_events).toEqual([EMAIL_ID]);
  });
});
