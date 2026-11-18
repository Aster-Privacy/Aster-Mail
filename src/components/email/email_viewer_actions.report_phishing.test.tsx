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
import type { EmailViewerActionsDeps } from "@/components/email/email_viewer_actions";
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const update_item_metadata = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, encrypted: null })),
);
const report_phishing_message = vi.hoisted(() => vi.fn(async () => {}));
const report_not_phishing_message = vi.hoisted(() => vi.fn(async () => {}));
const report_spam_sender = vi.hoisted(() =>
  vi.fn(async () => ({ data: { success: true } })),
);

vi.mock("@/lib/phishing_blocklist", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/phishing_blocklist")>()),
  report_phishing_message,
  report_not_phishing_message,
}));

vi.mock("@/services/api/mail", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/mail")>()),
  report_spam_sender,
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata,
  bulk_update_metadata_by_ids: async () => ({ success: true }),
}));

vi.mock("@/services/category_index", () => ({ reindex_ids: vi.fn() }));

vi.mock("@/hooks/use_stat_helpers", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/use_stat_helpers")>()),
  apply_stat_deltas: vi.fn(),
  revert_stat_deltas: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_unread: vi.fn(),
  adjust_stats_spam: vi.fn(),
  adjust_stats_trash: vi.fn(),
  adjust_stats_archived: vi.fn(),
  adjust_stats_inbox: vi.fn(),
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

const { use_email_viewer_actions } =
  await import("@/components/email/email_viewer_actions");

type Actions = ReturnType<typeof use_email_viewer_actions>;

let latest!: Actions;
let root!: Root;
let thread: Partial<DecryptedThreadMessage>[] = [];

function Harness() {
  latest = use_email_viewer_actions({
    email_id: "m1",
    email: null,
    mail_item: {
      id: "m1",
      item_type: "received",
      encrypted_metadata: "meta",
      metadata_nonce: "nonce",
      metadata_version: 1,
      is_trashed: false,
      metadata: { is_read: true, is_pinned: false, is_trashed: false },
    } as unknown as EmailViewerActionsDeps["mail_item"],
    is_read: true,
    is_pinned: false,
    is_archive_loading: false,
    is_spam_loading: false,
    is_trash_loading: false,
    is_pin_loading: false,
    is_external: false,
    thread_messages: thread as DecryptedThreadMessage[],
    current_user_email: "me@astermail.org",
    thread_ghost_email: undefined,
    set_is_read: vi.fn(),
    set_is_pinned: vi.fn(),
    set_is_archive_loading: () => {},
    set_is_spam_loading: () => {},
    set_is_trash_loading: () => {},
    set_is_pin_loading: () => {},
    set_mail_item: vi.fn(),
    set_thread_messages: () => {},
    set_thread_draft: () => {},
    set_view_source_message: () => {},
    on_dismiss: vi.fn(),
    t: (key) => key,
    format_email_detail: () => "",
    preferences_default_reply_behavior: "reply",
  });

  return null;
}

function render() {
  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(createElement(Harness));
  });
}

const phishing_message = {
  id: "m1",
  item_type: "received",
  sender_email: "alerts@spoof.example",
  encrypted_metadata: "meta",
  metadata_nonce: "nonce",
  body: "",
  html_content:
    '<p><a href="https://login.bad.example/verify">Verify</a> <a href="mailto:x@y.example">mail</a></p>',
} as unknown as DecryptedThreadMessage;

describe("report phishing", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    update_item_metadata.mockClear();
    report_phishing_message.mockClear();
    report_not_phishing_message.mockClear();
    report_spam_sender.mockClear();
    thread = [phishing_message];
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("reports the links and sender for the phishing blocklist", async () => {
    render();
    await act(async () => {
      await latest.handle_per_message_report_phishing(phishing_message);
    });

    expect(report_spam_sender).toHaveBeenCalledWith("alerts@spoof.example");
    expect(report_phishing_message).toHaveBeenCalledWith(phishing_message);
  });

  it("reports nothing when the message could not be moved", async () => {
    update_item_metadata.mockResolvedValueOnce({
      success: false,
      encrypted: null,
    });
    render();
    await act(async () => {
      await latest.handle_per_message_report_phishing(phishing_message);
    });

    expect(report_phishing_message).not.toHaveBeenCalled();
  });

  it("tells the blocklist a message marked not spam is not phishing", async () => {
    render();
    await act(async () => {
      await latest.handle_per_message_not_spam(phishing_message);
    });

    expect(report_not_phishing_message).toHaveBeenCalledWith(phishing_message);
    expect(report_phishing_message).not.toHaveBeenCalled();
  });
});
