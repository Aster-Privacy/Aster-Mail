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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const THREAD = "thread-progressive";
const OTHER_THREAD = "thread-other";
const THREAD_SIZE = 6;

type ServerMessage = {
  id: string;
  item_type: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  encrypted_metadata: string;
  metadata_nonce: string;
  metadata_version: number;
  message_ts: string;
  created_at: string;
  is_external: boolean;
  thread_token?: string;
};

const h = vi.hoisted(() => ({
  server: [] as ServerMessage[],
  other: [] as ServerMessage[],
  socket_live: true,
  thread_gate: null as Promise<void> | null,
  thread_fails: false,
  fetches: 0,
  envelope_decrypts: 0,
  metadata_decrypts: 0,
}));

function timestamp(index: number): string {
  return new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString();
}

function server_message(index: number): ServerMessage {
  return {
    id: `m${index}`,
    item_type: "received",
    encrypted_envelope: `env-${index}`,
    envelope_nonce: `nonce-${index}`,
    encrypted_metadata: `meta-${index}`,
    metadata_nonce: `meta-nonce-${index}`,
    metadata_version: 1,
    message_ts: timestamp(index),
    created_at: timestamp(index),
    is_external: false,
  };
}

vi.mock("@/services/sync_client", () => ({
  CATCH_UP_WHILE_LIVE_MS: 180_000,
  sync_client: { is_connected: () => h.socket_live },
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: async (encrypted: string) => {
    h.envelope_decrypts += 1;
    const index = Number(encrypted.replace("env-", ""));

    return {
      from: { name: "Sender", email: "sender@example.org" },
      to: [{ name: "Me", email: "me@astermail.org" }],
      cc: [],
      bcc: [],
      subject: "Weekly update",
      body_text: `Message number ${index}`,
      raw_headers: [],
      sent_at: timestamp(index),
    };
  },
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async (encrypted: string) => {
    h.metadata_decrypts += 1;

    return { is_read: true, is_starred: encrypted.endsWith("-starred") };
  },
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/components/email/shared/build_email_from_envelope", () => ({
  process_envelope_body: async () => ({
    body_text: "body",
    safe_html: "",
    unsubscribe_info: undefined,
  }),
  build_preview_text: () => "body",
  build_single_thread_message: (item: { id: string; created_at: string }) => ({
    id: item.id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.org",
    subject: "Weekly update",
    body: "body",
    timestamp: item.created_at,
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: false,
  }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  are_keys_ready: () => true,
  on_keys_ready: () => () => {},
  on_vault_cleared: () => () => {},
  get_vault_from_memory: () => null,
  get_passphrase_bytes: () => null,
  wait_for_keys_ready: async () => true,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => null,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item: async (id: string) => {
    const own =
      [...h.server, ...h.other].find((m) => m.id === id) ?? h.server[0];

    return {
      data: {
        ...own,
        id,
        thread_token: own.thread_token ?? THREAD,
        labels: [],
      },
      error: null,
    };
  },
  get_thread_messages: async (thread_token: string) => {
    h.fetches += 1;
    if (h.thread_gate) await h.thread_gate;
    if (h.thread_fails) throw new Error("offline");

    return {
      data: {
        thread: { thread_token },
        messages: (thread_token === OTHER_THREAD ? h.other : h.server).map(
          (m) => ({ ...m }),
        ),
      },
      error: null,
    };
  },
  list_mail_items: async () => ({ data: null, error: "unused" }),
  create_thread: async () => ({ data: null, error: "unused" }),
  link_mail_to_thread: async () => ({ data: null, error: "unused" }),
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: vi.fn(),
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

const { use_email_viewer } =
  await import("@/components/email/use_email_viewer");
const { clear_mail_cache } = await import("@/hooks/email_list_cache");

type View = ReturnType<typeof use_email_viewer>;

let root: Root | null = null;
let view: View | null = null;
let open_gate: () => void = () => {};

function Harness({ email_id }: { email_id: string }) {
  view = use_email_viewer({ email_id, on_dismiss: () => {} });

  return null;
}

function show(email_id: string): void {
  act(() => {
    if (!root) root = createRoot(document.createElement("div"));
    root.render(createElement(Harness, { email_id }));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function hold_thread(): void {
  h.thread_gate = new Promise<void>((resolve) => {
    open_gate = resolve;
  });
}

function ids(): string[] {
  return view!.thread_messages.map((m: DecryptedThreadMessage) => m.id);
}

const OPENED = `m${THREAD_SIZE - 1}`;
const ALL = Array.from({ length: THREAD_SIZE }, (_, i) => `m${i}`);

describe("opening a message in a conversation", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    clear_mail_cache();
    h.server = Array.from({ length: THREAD_SIZE }, (_, i) => server_message(i));
    h.other = Array.from({ length: THREAD_SIZE }, (_, i) => ({
      ...server_message(100 + i),
      thread_token: OTHER_THREAD,
    }));
    h.thread_gate = null;
    h.thread_fails = false;
    h.fetches = 0;
  });

  afterEach(() => {
    open_gate();
    if (root) act(() => root!.unmount());
    root = null;
    view = null;
    vi.useRealTimers();
  });

  it("shows the opened message before the rest of the conversation loads", async () => {
    hold_thread();
    show(OPENED);
    await advance(10);

    expect(h.fetches).toBe(1);
    expect(view!.is_loading).toBe(false);
    expect(view!.is_content_current).toBe(true);
    expect(view!.email?.id).toBe(OPENED);
    expect(ids()).toEqual([OPENED]);
  });

  it("fills in the conversation once it loads", async () => {
    hold_thread();
    show(OPENED);
    await advance(10);
    open_gate();
    await advance(10);

    expect(ids()).toEqual(ALL);
    expect(view!.is_loading).toBe(false);
  });

  it("keeps the opened message when the conversation fails to load", async () => {
    h.thread_fails = true;
    show(OPENED);
    await advance(10);

    expect(ids()).toEqual([OPENED]);
    expect(view!.is_loading).toBe(false);
    expect(view!.is_content_current).toBe(true);
  });

  it("shows a message from the middle of the conversation first", async () => {
    hold_thread();
    show("m2");
    await advance(10);

    expect(ids()).toEqual(["m2"]);

    open_gate();
    await advance(10);

    expect(ids()).toEqual(ALL);
  });

  it("drops a slow conversation after the viewer moves to another message", async () => {
    hold_thread();
    show(OPENED);
    await advance(10);

    const release_first = open_gate;

    h.thread_gate = null;
    show("m105");
    await advance(10);

    expect(ids()).toEqual(h.other.map((m) => m.id));

    release_first();
    await advance(10);

    expect(ids()).toEqual(h.other.map((m) => m.id));
  });
});
