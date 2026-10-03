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

import { MAIL_EVENTS } from "@/hooks/mail_events";

const THREAD = "thread-counts";
const THREAD_SIZE = 40;

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
};

const h = vi.hoisted(() => ({
  server: [] as ServerMessage[],
  socket_live: true,
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
    const own = h.server.find((m) => m.id === id) ?? h.server[0];

    return {
      data: { ...own, id, thread_token: THREAD, labels: [] },
      error: null,
    };
  },
  get_thread_messages: async () => {
    h.fetches += 1;

    return {
      data: {
        thread: { thread_token: THREAD },
        messages: h.server.map((m) => ({ ...m })),
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

type Rendered = {
  root: Root;
  messages: () => DecryptedThreadMessage[];
};

let mounted: Rendered | null = null;

function render_viewer(): Rendered {
  let latest: DecryptedThreadMessage[] = [];

  const email_id = `m${THREAD_SIZE - 1}`;

  function Harness() {
    const view = use_email_viewer({ email_id, on_dismiss: () => {} });

    latest = view.thread_messages;

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  mounted = { root, messages: () => latest };

  return mounted;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function emit(event: string, detail?: unknown): void {
  act(() => {
    window.dispatchEvent(
      detail === undefined
        ? new CustomEvent(event)
        : new CustomEvent(event, { detail }),
    );
  });
}

function reset_counts(): void {
  h.fetches = 0;
  h.envelope_decrypts = 0;
  h.metadata_decrypts = 0;
}

function counts() {
  return {
    fetches: h.fetches,
    decrypts: h.envelope_decrypts + h.metadata_decrypts,
  };
}

async function open_thread(): Promise<Rendered> {
  const rendered = render_viewer();

  await advance(10);
  expect(rendered.messages()).toHaveLength(THREAD_SIZE);
  await advance(6_000);
  reset_counts();

  return rendered;
}

describe("open thread refresh work for a 40-message thread", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    clear_mail_cache();
    h.server = Array.from({ length: THREAD_SIZE }, (_, i) => server_message(i));
    h.socket_live = true;
    reset_counts();
  });

  afterEach(() => {
    const rendered = mounted;

    mounted = null;
    if (rendered) act(() => rendered.root.unmount());
    vi.useRealTimers();
  });

  it("decrypts only the starred message once when a star is toggled", async () => {
    const rendered = await open_thread();
    const before = rendered.messages();

    h.server[5] = {
      ...h.server[5],
      encrypted_metadata: "meta-5-starred",
      metadata_nonce: "meta-nonce-5b",
    };
    emit(MAIL_EVENTS.MAIL_CHANGED);
    await advance(600);
    emit(MAIL_EVENTS.MAIL_SOFT_REFRESH);
    await advance(2_000);

    expect(counts()).toEqual({ fetches: 1, decrypts: 1 });

    const after = rendered.messages();

    expect(after.find((m) => m.id === "m5")?.is_starred).toBe(true);
    expect(after.filter((m, i) => m !== before[i]).map((m) => m.id)).toEqual([
      "m5",
    ]);
  });

  it("fetches once and decrypts nothing for a change outside the thread", async () => {
    const rendered = await open_thread();
    const before = rendered.messages();

    emit(MAIL_EVENTS.MAIL_CHANGED);
    await advance(2_000);

    expect(counts()).toEqual({ fetches: 1, decrypts: 0 });
    expect(rendered.messages()).toBe(before);
  });

  it("does not refetch during an idle minute while the live connection is up", async () => {
    await open_thread();

    await advance(60_000);

    expect(counts()).toEqual({ fetches: 0, decrypts: 0 });
  });

  it("still polls every minute when the live connection is down", async () => {
    h.socket_live = false;
    await open_thread();

    await advance(60_000);

    expect(counts()).toEqual({ fetches: 1, decrypts: 0 });
  });

  it("still polls as a fallback while the live connection is up", async () => {
    await open_thread();

    await advance(180_000);

    expect(counts()).toEqual({ fetches: 1, decrypts: 0 });
  });

  it("decrypts only the new reply when one arrives in the thread", async () => {
    const rendered = await open_thread();

    h.server = [...h.server, server_message(THREAD_SIZE)];
    emit(MAIL_EVENTS.EMAIL_RECEIVED, {
      email_id: `m${THREAD_SIZE}`,
      sender: "sender@example.org",
      subject: "Weekly update",
    });
    await advance(2_000);

    expect(counts()).toEqual({ fetches: 1, decrypts: 2 });
    expect(rendered.messages()).toHaveLength(THREAD_SIZE + 1);
    expect(rendered.messages().at(-1)?.body).toBe(
      `Message number ${THREAD_SIZE}`,
    );
  });

  it("removes a deleted message without decrypting the rest again", async () => {
    const rendered = await open_thread();

    h.server = h.server.filter((m) => m.id !== "m10");
    emit(MAIL_EVENTS.MAIL_ITEMS_REMOVED, { ids: ["m10"] });
    emit(MAIL_EVENTS.MAIL_CHANGED);
    await advance(600);
    emit(MAIL_EVENTS.MAIL_SOFT_REFRESH);
    await advance(2_000);

    expect(counts()).toEqual({ fetches: 1, decrypts: 0 });
    expect(rendered.messages().map((m) => m.id)).not.toContain("m10");
    expect(rendered.messages()).toHaveLength(THREAD_SIZE - 1);
  });

  it("still refreshes while a steady stream of events keeps arriving", async () => {
    const rendered = await open_thread();

    h.server[5] = {
      ...h.server[5],
      encrypted_metadata: "meta-5-starred",
      metadata_nonce: "meta-nonce-5b",
    };
    for (let i = 0; i < 4; i++) {
      emit(MAIL_EVENTS.MAIL_SOFT_REFRESH);
      await advance(700);
    }

    expect(h.fetches).toBe(1);
    expect(rendered.messages().find((m) => m.id === "m5")?.is_starred).toBe(
      true,
    );
  });

  it("decrypts the whole thread again after the mail cache is cleared", async () => {
    await open_thread();

    clear_mail_cache();
    emit(MAIL_EVENTS.MAIL_CHANGED);
    await advance(2_000);

    expect(counts()).toEqual({ fetches: 1, decrypts: THREAD_SIZE * 2 });
  });
});
