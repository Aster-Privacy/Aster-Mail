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
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const THREAD = "thread-open-first";
const THREAD_SIZE = 10;
const OPENED = `m${THREAD_SIZE - 1}`;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const h = vi.hoisted(() => ({
  thread_requests: 0,
  envelope_decrypts_started: 0,
  envelope_decrypts_done: 0,
  decrypt_gate: null as Promise<void> | null,
  thread_response: null as Promise<unknown> | null,
}));

function timestamp(index: number): string {
  return new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString();
}

function server_message(index: number) {
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

function thread_payload() {
  return {
    data: {
      thread: { thread_token: THREAD },
      messages: Array.from({ length: THREAD_SIZE }, (_, i) =>
        server_message(i),
      ),
    },
    error: null,
  };
}

vi.mock("@/services/sync_client", () => ({
  CATCH_UP_WHILE_LIVE_MS: 180_000,
  sync_client: { is_connected: () => true },
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: async (encrypted: string) => {
    h.envelope_decrypts_started += 1;
    if (h.decrypt_gate) await h.decrypt_gate;
    h.envelope_decrypts_done += 1;
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
  decrypt_mail_metadata: async () => ({ is_read: true, is_starred: false }),
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/components/email/shared/build_email_from_envelope", () => ({
  process_envelope_body: async (envelope: { body_text: string }) => ({
    body_text: envelope.body_text,
    safe_html: "",
    unsubscribe_info: undefined,
  }),
  build_preview_text: (text: string) => text,
  build_single_thread_message: (
    item: { id: string; created_at: string },
    _envelope: unknown,
    body_text: string,
  ) => ({
    id: item.id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.org",
    subject: "Weekly update",
    body: body_text,
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
  get_mail_item: async (id: string) => ({
    data: {
      ...server_message(Number(id.slice(1))),
      thread_token: THREAD,
      thread_message_count: THREAD_SIZE,
      labels: [],
    },
    error: null,
  }),
  get_thread_messages: async () => {
    h.thread_requests += 1;

    return h.thread_response ?? thread_payload();
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

type View = {
  is_loading: boolean;
  error: string | null;
  messages: DecryptedThreadMessage[];
  pending: number;
};

let root: Root | null = null;

function render_viewer(): () => View {
  let latest: View = {
    is_loading: true,
    error: null,
    messages: [],
    pending: 0,
  };

  function Harness() {
    const view = use_email_viewer({ email_id: OPENED, on_dismiss: () => {} });

    latest = {
      is_loading: view.is_loading,
      error: view.error,
      messages: view.thread_messages,
      pending: view.pending_thread_count,
    };

    return null;
  }

  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(createElement(Harness));
  });

  return () => latest;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("opening a threaded message", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clear_mail_cache();
    h.thread_requests = 0;
    h.envelope_decrypts_started = 0;
    h.envelope_decrypts_done = 0;
    h.decrypt_gate = null;
    h.thread_response = null;
  });

  afterEach(() => {
    const mounted = root;

    root = null;
    if (mounted) act(() => mounted.unmount());
  });

  it("shows the opened message while the thread request is still pending", async () => {
    const thread = deferred<unknown>();

    h.thread_response = thread.promise;
    const view = render_viewer();

    await settle();

    expect(h.thread_requests).toBe(1);
    expect(view().is_loading).toBe(false);
    expect(view().messages.map((m) => m.id)).toEqual([OPENED]);
    expect(view().messages[0].body).toBe(`Message number ${THREAD_SIZE - 1}`);
    expect(view().pending).toBe(THREAD_SIZE - 1);

    thread.resolve(thread_payload());
    await settle();

    expect(h.thread_requests).toBe(1);
    expect(view().pending).toBe(0);
    expect(view().messages).toHaveLength(THREAD_SIZE);
    expect(view().messages.at(-1)?.id).toBe(OPENED);
  });

  it("asks for the thread before the opened message has finished decrypting", async () => {
    const gate = deferred<void>();

    h.decrypt_gate = gate.promise;
    const view = render_viewer();

    await settle();

    expect(h.envelope_decrypts_done).toBe(0);
    expect(h.thread_requests).toBe(1);

    h.decrypt_gate = null;
    gate.resolve();
    await settle();

    expect(h.thread_requests).toBe(1);
    expect(view().messages).toHaveLength(THREAD_SIZE);
    expect(view().is_loading).toBe(false);
  });

  it("keeps the opened message on screen when the thread request fails", async () => {
    const thread = deferred<unknown>();

    h.thread_response = thread.promise;
    const view = render_viewer();

    await settle();
    thread.reject(new Error("network down"));
    await settle();

    expect(h.thread_requests).toBe(1);
    expect(view().error).toBeNull();
    expect(view().is_loading).toBe(false);
    expect(view().pending).toBe(0);
    expect(view().messages.map((m) => m.id)).toEqual([OPENED]);
  });

  it("keeps the opened message when the thread comes back empty", async () => {
    h.thread_response = Promise.resolve({ data: null, error: "unavailable" });
    const view = render_viewer();

    await settle();

    expect(h.thread_requests).toBe(1);
    expect(view().error).toBeNull();
    expect(view().messages.map((m) => m.id)).toEqual([OPENED]);
  });
});
