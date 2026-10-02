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

const preferences = vi.hoisted(() => ({ force_dark_mode_emails: true }));

function message(id: string): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: "Subject",
    body: "Body",
    timestamp: "2026-01-01T00:00:00.000Z",
    is_read: true,
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
vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: vi.fn(),
}));
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

import { refresh_resolved_accent } from "@/lib/resolved_accent";

let current: ReturnType<typeof use_mobile_mail_detail>;
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;

function Detail() {
  current = use_mobile_mail_detail();

  return null;
}

function set_dark_class(is_dark: boolean) {
  act(() => {
    document.documentElement.classList.toggle("dark", is_dark);
    document.documentElement.classList.toggle("light", !is_dark);
    refresh_resolved_accent();
  });
}

function mount() {
  set_dark_class(true);
  root = createRoot(container);
  act(() => root.render(<Detail />));
}

function open_menu(id: string) {
  const target = current.display_messages.find((m) => m.id === id) ?? null;

  act(() => current.set_menu_message(target));
}

beforeEach(() => {
  preferences.force_dark_mode_emails = true;
  detail.thread_messages = [message("a"), message("b")];
});

afterEach(() => {
  act(() => root.unmount());
  document.documentElement.classList.remove("dark", "light");
  refresh_resolved_accent();
});

describe("mobile email dark mode follows app appearance", () => {
  it("applies Force Dark Mode for Emails only while the app is dark", () => {
    mount();
    expect(current.is_dark_mode_message("a")).toBe(true);
    set_dark_class(false);
    expect(current.is_dark_mode_message("a")).toBe(false);
    expect(current.is_dark_mode_opted_out("a")).toBe(false);
    set_dark_class(true);
    expect(current.is_dark_mode_message("a")).toBe(true);
  });

  it("clears message and conversation choices when the app appearance changes", () => {
    preferences.force_dark_mode_emails = false;
    mount();
    open_menu("a");
    act(() => current.handle_toggle_dark_mode());
    expect(current.is_dark_mode_message("a")).toBe(true);
    expect(current.menu_message).toBeNull();
    act(() => current.handle_toggle_all_dark_mode());
    expect(current.is_dark_mode_message("b")).toBe(true);
    set_dark_class(false);
    expect(current.is_dark_mode_message("a")).toBe(false);
    expect(current.is_dark_mode_message("b")).toBe(false);
  });

  it("keeps a per-message choice made in the light app", () => {
    mount();
    set_dark_class(false);
    open_menu("a");
    act(() => current.handle_toggle_dark_mode());
    expect(current.is_dark_mode_message("a")).toBe(true);
    expect(current.is_dark_mode_message("b")).toBe(false);
    open_menu("b");
    act(() => current.handle_toggle_dark_mode());
    expect(current.is_dark_mode_message("a")).toBe(true);
  });

  it("clears an opt-out from forced dark mode on an appearance change", () => {
    mount();
    open_menu("a");
    act(() => current.handle_toggle_dark_mode());
    expect(current.is_dark_mode_opted_out("a")).toBe(true);
    set_dark_class(false);
    set_dark_class(true);
    expect(current.is_dark_mode_opted_out("a")).toBe(false);
    expect(current.is_dark_mode_message("a")).toBe(true);
  });
});
