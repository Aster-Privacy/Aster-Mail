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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MAIL_EVENTS } from "@/hooks/mail_events";

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

const thread_messages_by_token: Record<string, ThreadMessage[]> = {
  "thread-a": [
    message("a1", "2026-09-30T00:00:00Z"),
    message("a2", "2026-09-30T01:00:00Z"),
  ],
  "thread-b": [message("b1", "2026-10-01T00:00:00Z")],
};

const thread_token_by_id: Record<string, string> = {
  a2: "thread-a",
  b1: "thread-b",
};

let held_token: string | null = null;
let release_held: (() => void) | null = null;

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
  get_mail_item: async (id: string) => {
    const token = thread_token_by_id[id];
    const own = thread_messages_by_token[token].find((m) => m.id === id);

    return {
      data: {
        id,
        item_type: "received",
        encrypted_envelope: "envelope",
        envelope_nonce: "nonce",
        is_external: false,
        is_read: true,
        created_at: own ? own.timestamp : "2026-09-30T00:00:00Z",
        thread_token: token,
        metadata: { is_read: true },
        labels: [],
      },
      error: null,
    };
  },
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: vi.fn(),
}));

vi.mock("@/services/thread_service", () => ({
  fetch_and_decrypt_thread_messages: async (thread_token: string) => {
    if (held_token === thread_token) {
      await new Promise<void>((resolve) => {
        release_held = resolve;
      });
    }

    return {
      messages: thread_messages_by_token[thread_token] ?? [],
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
  await_preloaded_email: async () => null,
  delete_preloaded_email: vi.fn(),
  get_preloaded_email: () => null,
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
  request_cache: { clear: vi.fn(), invalidate: vi.fn() },
}));

vi.mock("@/hooks/use_mail_stats", () => ({ adjust_stats_unread: vi.fn() }));

const { use_email_viewer } = await import(
  "@/components/email/use_email_viewer"
);

type Rendered = {
  root: Root;
  open: (id: string) => void;
  thread_ids: () => string[];
};

function render_hook(initial_id: string): Rendered {
  let latest: string[] = [];
  let set_id: (id: string) => void = () => {};

  function Harness() {
    const [email_id, set_email_id] = useState(initial_id);

    set_id = set_email_id;
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

  return {
    root,
    open: (id) => act(() => set_id(id)),
    thread_ids: () => latest,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
  });
}

describe("switching messages while a thread refresh is in flight", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    held_token = null;
    release_held = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops the earlier thread refresh instead of showing it over the new message", async () => {
    const rendered = render_hook("a2");

    await flush();
    expect(rendered.thread_ids()).toEqual(["a1", "a2"]);

    held_token = "thread-a";
    act(() => {
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
    });
    await flush();
    expect(release_held).not.toBeNull();

    rendered.open("b1");
    await flush();
    expect(rendered.thread_ids()).toEqual(["b1"]);

    act(() => release_held?.());
    await flush();
    expect(rendered.thread_ids()).toEqual(["b1"]);

    act(() => rendered.root.unmount());
  });

  it("still applies a refresh for the thread that stays open", async () => {
    const rendered = render_hook("a2");

    await flush();

    thread_messages_by_token["thread-a"] = [
      ...thread_messages_by_token["thread-a"],
      message("a3", "2026-09-30T02:00:00Z"),
    ];
    act(() => {
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
    });
    await flush();

    expect(rendered.thread_ids()).toEqual(["a1", "a2", "a3"]);

    act(() => rendered.root.unmount());
  });
});
