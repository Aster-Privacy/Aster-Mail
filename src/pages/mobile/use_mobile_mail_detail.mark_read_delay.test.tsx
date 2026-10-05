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
import type { DecryptedThreadMessage } from "@/types/thread";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const preferences = vi.hoisted(() => ({
  force_dark_mode_emails: false,
  mark_as_read_delay: "immediate" as
    "immediate" | "1_second" | "3_seconds" | "never",
}));

function message(id: string, is_read = false): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: "Subject",
    body: "Body",
    timestamp: "2026-01-01T00:00:00.000Z",
    is_read,
    is_starred: false,
    is_deleted: false,
    is_external: false,
  } as DecryptedThreadMessage;
}

const detail = vi.hoisted(() => ({
  email_id: "a",
  email: null,
  mail_item: null,
  thread_messages: [] as unknown[],
  current_user_email: "me@example.com",
  is_loading: false,
  can_go_newer: false,
  can_go_older: false,
  email_list: [],
  current_email_index: 0,
  preferences: { conversation_grouping: true, low_network_mode: false },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
}));
vi.mock("@/components/email/hooks/use_email_detail", () => ({
  use_email_detail: () => detail,
  preload_email_detail: vi.fn(),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences, update_preference: vi.fn() }),
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/auth_context", () => ({ use_auth_safe: () => null }));
vi.mock("@/components/email/use_spam_confirm", () => ({
  use_spam_confirm: () => ({
    request_spam: vi.fn(),
    spam_confirm_dialog: null,
  }),
}));
vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({ sender_options: [] }),
}));
vi.mock("@/hooks/use_email_actions", () => ({ use_email_actions: () => ({}) }));
vi.mock("@/hooks/use_email_list", () => ({
  remove_email_from_view_cache: vi.fn(),
}));
vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({ format_email_detail: () => "" }),
}));
vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));
vi.mock("@/hooks/use_snooze", () => ({ use_snooze: () => ({}) }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));
vi.mock("@/components/compose/compose_shared", () => ({
  get_aster_footer: () => "",
}));
const update_item_metadata = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ success: true })),
);

vi.mock("@/services/crypto/mail_metadata", () => ({ update_item_metadata }));
vi.mock("@/hooks/mail_events", () => ({ emit_mail_item_updated: vi.fn() }));
vi.mock("@/services/read_intent", () => ({ get_read_intent: () => null }));
vi.mock("@/services/user_opened_mail", () => ({
  current_opened_mail_scope: () => 0,
}));
vi.mock("@/native/haptic_feedback", () => ({ haptic_impact: vi.fn() }));
vi.mock("@/services/api/blocked_senders", () => ({ block_sender: vi.fn() }));
vi.mock("@/services/lockdown_store", () => ({
  is_lockdown_enabled: () => false,
  LOCKDOWN_CHANGED_EVENT: "lockdown-changed",
}));
vi.mock("@/lib/aster_footer_strip", () => ({
  strip_aster_footers_html: (html: string) => html,
}));
vi.mock("@/utils/copy_text", () => ({ copy_text_or_throw: vi.fn() }));
vi.mock("@/components/email/build_reply_recipient", () => ({
  build_reply_recipient_for_message: vi.fn(),
}));
vi.mock("@/components/email/build_reply_from_address", () => ({
  resolve_own_recipient_address: vi.fn(),
}));
vi.mock("@/utils/delivered_to", () => ({
  resolve_received_on_address: vi.fn(),
}));
vi.mock("@/lib/reply_subject", () => ({ build_reply_subject: vi.fn() }));
vi.mock("@/lib/reply_defaults", () => ({
  reply_includes_quoted_by_default: () => true,
  resolve_reply_prefix: () => "Re:",
}));
vi.mock("@/utils/date_format", () => ({ app_locale: () => "en" }));
vi.mock("@/lib/reply_references", () => ({
  resolve_reply_references: vi.fn(),
}));
vi.mock("@/lib/html_sanitizer_compose", () => ({
  sanitize_outgoing_html: (html: string) => html,
}));
vi.mock("@/lib/forward_css_inliner", () => ({
  inline_email_css: (html: string) => html,
}));

import { use_mobile_mail_detail } from "./use_mobile_mail_detail";

let current: ReturnType<typeof use_mobile_mail_detail>;
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;

function Detail() {
  current = use_mobile_mail_detail();

  return null;
}

function mount() {
  root = createRoot(container);
  act(() => root.render(<Detail />));
}

function marked_ids(): string[] {
  return update_item_metadata.mock.calls.map(
    (call) => (call as unknown as [string])[0],
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  update_item_metadata.mockClear();
  preferences.mark_as_read_delay = "immediate";
  detail.email_id = "c";
  detail.thread_messages = [message("a"), message("b", true), message("c")];
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("mobile mail detail honours the mark as read setting", () => {
  it("marks the expanded unread messages read on open by default", () => {
    mount();
    expect(current.expanded_ids.has("a")).toBe(true);
    expect(current.expanded_ids.has("c")).toBe(true);
    expect(marked_ids().sort()).toEqual(["a", "c"]);
  });

  it("leaves every message unread on open when set to never", () => {
    preferences.mark_as_read_delay = "never";
    mount();
    act(() => vi.advanceTimersByTime(10_000));
    expect(current.expanded_ids.has("a")).toBe(true);
    expect(current.expanded_ids.has("c")).toBe(true);
    expect(update_item_metadata).not.toHaveBeenCalled();
  });

  it("keeps a single opened message unread when set to never", () => {
    preferences.mark_as_read_delay = "never";
    detail.thread_messages = [message("c")];
    mount();
    act(() => vi.advanceTimersByTime(10_000));
    expect(update_item_metadata).not.toHaveBeenCalled();
  });

  it("waits one second before marking read", () => {
    preferences.mark_as_read_delay = "1_second";
    mount();
    act(() => vi.advanceTimersByTime(999));
    expect(update_item_metadata).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(marked_ids().sort()).toEqual(["a", "c"]);
  });

  it("waits three seconds before marking read", () => {
    preferences.mark_as_read_delay = "3_seconds";
    mount();
    act(() => vi.advanceTimersByTime(2_999));
    expect(update_item_metadata).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(marked_ids().sort()).toEqual(["a", "c"]);
  });

  it("does not mark read when another email opens before the delay ends", () => {
    preferences.mark_as_read_delay = "3_seconds";
    mount();
    act(() => vi.advanceTimersByTime(2_000));
    detail.email_id = "d";
    detail.thread_messages = [message("d", true)];
    act(() => root.render(<Detail />));
    act(() => vi.advanceTimersByTime(10_000));
    expect(update_item_metadata).not.toHaveBeenCalled();
  });

  it("still marks a message read when the user expands it with never", () => {
    preferences.mark_as_read_delay = "never";
    detail.thread_messages = [
      message("a"),
      message("b"),
      message("c"),
      message("d"),
      message("e"),
      message("f"),
      message("g"),
    ];
    mount();
    expect(current.expanded_ids.has("a")).toBe(false);
    const target = current.display_messages.find((m) => m.id === "a")!;

    act(() => current.handle_toggle_expand(target));
    expect(current.expanded_ids.has("a")).toBe(true);
    expect(marked_ids()).toEqual(["a"]);
  });

  it("marks an expanded message read right away while a delay is pending", () => {
    preferences.mark_as_read_delay = "3_seconds";
    detail.thread_messages = [
      message("a"),
      message("b"),
      message("c"),
      message("d"),
      message("e"),
      message("f"),
      message("g"),
    ];
    mount();
    const target = current.display_messages.find((m) => m.id === "a")!;

    act(() => current.handle_toggle_expand(target));
    expect(marked_ids()).toEqual(["a"]);
    act(() => vi.advanceTimersByTime(3_000));
    expect(marked_ids().sort()).toEqual(["a", "c", "d", "e", "f", "g"]);
  });
});
