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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

type ThreadMessage = {
  id: string;
  item_type: "received";
  sender_name: string;
  sender_email: string;
  subject: string;
  body: string;
  html_content: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  is_deleted: boolean;
  is_external: boolean;
  to_recipients: never[];
  cc_recipients: never[];
  bcc_recipients: never[];
};

function message(id: string, timestamp: string): ThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.org",
    subject: id,
    body: `body ${id}`,
    html_content: `<p>body ${id}</p>`,
    timestamp,
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: false,
    to_recipients: [],
    cc_recipients: [],
    bcc_recipients: [],
  };
}

const server_thread: ThreadMessage[] = [];
let preloaded_entry: Record<string, unknown> | null = null;
let entry_is_fresh = false;
const thread_fetches: string[] = [];
const invalidated: string[] = [];

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: async () => ({
    from: { name: "Sender", email: "sender@example.org" },
    to: [],
    cc: [],
    bcc: [],
    subject: "Hello",
    raw_headers: [],
    sent_at: "2026-09-30T00:00:00Z",
  }),
}));

vi.mock("@/components/email/shared/build_email_from_envelope", () => ({
  process_envelope_body: async () => ({
    body_text: "body",
    safe_html: "",
    unsubscribe_info: undefined,
  }),
  build_preview_text: () => "body",
  build_single_thread_message: (item: { id: string; created_at: string }) =>
    message(item.id, item.created_at),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  are_keys_ready: () => true,
  on_keys_ready: () => () => {},
  get_vault_from_memory: () => null,
  wait_for_keys_ready: async () => true,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => null,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item: async (id: string) => ({
    data: {
      id,
      item_type: "received",
      encrypted_envelope: "envelope",
      envelope_nonce: "nonce",
      is_external: false,
      is_read: true,
      created_at: "2026-09-30T00:00:00Z",
      thread_token: "thread-a",
      metadata: { is_read: true },
      labels: [],
    },
    error: null,
  }),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: vi.fn(),
}));

vi.mock("@/services/thread_service", () => ({
  fetch_and_decrypt_thread_messages: async (thread_token: string) => {
    thread_fetches.push(thread_token);

    return {
      messages: [...server_thread],
      thread_data: null,
      truncated: false,
    };
  },
  fetch_and_decrypt_virtual_group: async () => [],
  resolve_reaction_emojis: async () => [],
}));

vi.mock("@/services/api/multi_drafts", () => ({
  get_draft_by_thread: async () => ({ data: null, error: null }),
}));

vi.mock("@/components/email/hooks/preload_cache", () => ({
  await_preloaded_email: async () => preloaded_entry,
  delete_preloaded_email: vi.fn(),
  get_preloaded_email: () => preloaded_entry,
  is_preloaded_email_fresh: () => entry_is_fresh,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({
    format_email_detail: () => "",
    format_email_list: () => "",
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      conversation_grouping: true,
      mark_as_read_delay: "never",
    },
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org" } }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: null, is_feature_locked: () => false }),
}));

vi.mock("@/components/email/email_viewer_actions", () => ({
  use_email_viewer_actions: () => ({}),
}));

vi.mock("@/services/api/request_cache", () => ({
  request_cache: {
    clear: vi.fn(),
    invalidate: (pattern: string) => {
      invalidated.push(pattern);
    },
  },
}));

vi.mock("@/hooks/use_mail_stats", () => ({ adjust_stats_unread: vi.fn() }));

const { use_email_viewer } = await import(
  "@/components/email/use_email_viewer"
);

function preload_of(opened: ThreadMessage, thread: ThreadMessage[]) {
  return {
    mail_item: {
      id: opened.id,
      item_type: "received",
      encrypted_envelope: "envelope",
      envelope_nonce: "nonce",
      is_external: false,
      created_at: opened.timestamp,
      thread_token: "thread-a",
      thread_message_count: thread.length,
      metadata: { is_read: true },
    },
    email: {
      id: opened.id,
      sender: "Sender",
      sender_email: "sender@example.org",
      subject: "Hello",
      preview: "body",
      timestamp: opened.timestamp,
      is_read: true,
      is_starred: false,
      body: opened.body,
      html_content: opened.html_content,
      to: [],
      cc: [],
      bcc: [],
    },
    thread_messages: thread,
    thread_draft: null,
    current_user_email: "me@astermail.org",
    current_user_name: "Me",
    thread_sanitized: new Map(),
    thread_cid_resolved: new Map(),
    time: Date.now() - 5 * 60_000,
    is_stale: false,
    conversation_grouping: true,
  };
}

function render_hook(email_id: string): {
  root: Root;
  thread_ids: () => string[];
} {
  let latest: string[] = [];

  function Harness() {
    const view = use_email_viewer({ email_id, on_dismiss: () => {} });

    latest = view.thread_messages.map((m) => m.id);

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { root, thread_ids: () => latest };
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
  });
}

const first = message("a1", "2026-09-30T00:00:00Z");
const second = message("a2", "2026-09-30T00:05:00Z");

describe("opening a preloaded message after a sibling arrived", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    server_thread.length = 0;
    thread_fetches.length = 0;
    invalidated.length = 0;
    entry_is_fresh = false;
  });

  it("shows the sibling that joined the thread after the preload", async () => {
    server_thread.push(first, second);
    preloaded_entry = preload_of(first, [first]);

    const rendered = render_hook("a1");

    await flush();

    expect(rendered.thread_ids()).toEqual(["a1", "a2"]);
    expect(thread_fetches).toContain("thread-a");
    expect(
      invalidated.some((key) => key.includes("threads/thread-a/messages")),
    ).toBe(true);

    act(() => rendered.root.unmount());
  });

  it("keeps the preloaded conversation when the server has nothing new", async () => {
    server_thread.push(first, second);
    preloaded_entry = preload_of(first, [first, second]);
    entry_is_fresh = true;

    const rendered = render_hook("a1");

    await flush();

    expect(rendered.thread_ids()).toEqual(["a1", "a2"]);
    expect(
      invalidated.some((key) => key.includes("threads/thread-a/messages")),
    ).toBe(false);

    act(() => rendered.root.unmount());
  });

  it("keeps the opened message when the server thread omits it", async () => {
    server_thread.push(second);
    preloaded_entry = preload_of(first, [first]);

    const rendered = render_hook("a1");

    await flush();

    expect(rendered.thread_ids()).toEqual(["a1", "a2"]);

    act(() => rendered.root.unmount());
  });
});
