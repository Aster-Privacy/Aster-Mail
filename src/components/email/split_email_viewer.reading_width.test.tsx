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

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { default_reply_behavior: "reply" },
  }),
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

vi.mock("@/components/email/viewer_shared/use_viewer_labels", () => ({
  use_viewer_labels: () => ({
    labels: [],
    applied_tag_tokens: [],
    toggle_label: undefined,
  }),
}));

vi.mock("@/components/email/sandboxed_email_renderer", () => ({
  get_cached_iframe_height: () => undefined,
  CONTENT_READY_FALLBACK_MS: 1500,
}));

vi.mock("@/components/email/use_email_viewer", () => ({
  use_email_viewer: () => viewer,
}));

vi.mock("@/components/email/viewer_shared", () => ({
  ViewerToolbarActions: () => null,
  ViewerThreadContent: () =>
    React.createElement("div", { "data-thread-content": "" }),
  ViewerErrorState: () => null,
  get_external_content_mode: () => null,
  set_external_content_mode: () => {},
}));

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

const viewer = {
  email: {
    id: "email-1",
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
  is_loading: false,
  is_content_current: true,
  thread_messages: [],
  thread_list_ref: { current: null },
};

const { SplitEmailViewer } = await import("./split_email_viewer");

const classes_of = (el: Element | null | undefined): string[] =>
  (el?.className ?? "").split(/\s+/).filter(Boolean);

const width_caps = (el: Element | null | undefined): string[] =>
  classes_of(el).filter((c) => c === "mx-auto" || c.startsWith("max-w-"));

describe("SplitEmailViewer reading column", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<SplitEmailViewer email_id="email-1" on_close={() => {}} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("lets the subject and the message fill a wide reading pane together", () => {
    const column = container.querySelector("h1")?.parentElement?.parentElement;

    expect(classes_of(column)).toContain("w-full");
    expect(width_caps(column)).toEqual([]);
    expect(column?.querySelector("[data-thread-content]")).not.toBeNull();
  });

  it("keeps the loading skeleton as wide as the message it stands in for", () => {
    const skeleton_column =
      container.querySelector('[aria-busy="true"]')?.firstElementChild;

    expect(classes_of(skeleton_column)).toContain("w-full");
    expect(width_caps(skeleton_column)).toEqual([]);
  });
});
