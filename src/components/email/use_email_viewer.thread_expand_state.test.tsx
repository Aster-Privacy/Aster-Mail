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
import type {
  ThreadExpandState,
  ThreadMessagesListRef,
} from "@/components/email/thread_messages_list";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

const THREAD = "thread-expand-state";
const THREAD_SIZE = 6;
const UNREAD = new Set(["m1", "m2"]);

const h = vi.hoisted(() => ({ intervals: [] as number[] }));

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

vi.mock("@/services/sync_client", () => ({
  CATCH_UP_WHILE_LIVE_MS: 180_000,
  sync_client: { is_connected: () => true },
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: async (encrypted: string) => {
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
  decrypt_mail_metadata: async (encrypted: string) => ({
    is_read: !UNREAD.has(encrypted.replace("meta-", "m")),
    is_starred: false,
  }),
  update_item_metadata: async () => ({ success: true }),
  bulk_update_metadata_by_ids: async () => ({ success: true }),
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
    is_read: !UNREAD.has(item.id),
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
  get_current_account_id: async () => null,
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
  get_thread_messages: async () => ({
    data: {
      thread: { thread_token: THREAD },
      messages: Array.from({ length: THREAD_SIZE }, (_, i) =>
        server_message(i),
      ),
    },
    error: null,
  }),
  list_mail_items: async () => ({ data: null, error: "unused" }),
  create_thread: async () => ({ data: null, error: "unused" }),
  link_mail_to_thread: async () => ({ data: null, error: "unused" }),
  bulk_add_folder: async () => ({}),
  bulk_remove_folder: async () => ({}),
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
      conversation_order: "asc",
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

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_starred: vi.fn(),
  adjust_stats_unread: vi.fn(),
}));

vi.mock("@/components/email/thread_message_block", () => ({
  ThreadMessageBlock: ({ message }: { message: DecryptedThreadMessage }) =>
    createElement("div", { "data-row": message.id }),
}));

vi.mock("@/components/email/use_email_dark_mode", () => ({
  use_email_dark_mode: () => ({
    is_dark_mode_message: () => false,
    is_dark_mode_opted_out: () => false,
    toggle_dark_mode: () => {},
    set_all_dark_mode: () => {},
  }),
}));

vi.mock("@/lib/email_font_sources", () => ({
  preload_email_fonts: vi.fn(),
}));

vi.mock("@/hooks/use_folders", () => ({ get_cached_folders: () => [] }));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

const { use_email_viewer } =
  await import("@/components/email/use_email_viewer");
const { ThreadMessagesList } =
  await import("@/components/email/thread_messages_list");
const { clear_mail_cache } = await import("@/hooks/email_list_cache");

type Viewer = ReturnType<typeof use_email_viewer>;

let root: Root | null = null;
let open_email: (id: string) => void = () => {};

function render_viewer(initial: string): () => Viewer {
  let latest: Viewer | null = null;

  function Harness() {
    const [email_id, set_email_id] = useState(initial);
    const view = use_email_viewer({ email_id, on_dismiss: () => {} });

    open_email = set_email_id;
    latest = view;

    if (view.thread_messages.length < 2) return null;

    return createElement(ThreadMessagesList, {
      key: email_id,
      ref: view.thread_list_ref,
      on_expand_state_change: view.handle_thread_expand_state_change,
      hide_counter: true,
      current_user_email: "me@astermail.org",
      default_expanded_id: email_id,
      main_email_id: email_id,
      messages: view.thread_messages,
      subject: "Weekly update",
      thread_token: THREAD,
    });
  }

  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(createElement(Harness));
  });

  return () => latest!;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function list(view: () => Viewer): ThreadMessagesListRef {
  return view().thread_list_ref.current!;
}

function getters(view: () => Viewer): ThreadExpandState {
  const { all_expanded, all_collapsed, has_unread } = list(view);

  return { all_expanded, all_collapsed, has_unread };
}

describe("viewer thread expand state", () => {
  let real_set_interval: typeof window.setInterval;

  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clear_mail_cache();
    h.intervals = [];
    real_set_interval = window.setInterval;
    window.setInterval = ((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      h.intervals.push(delay ?? 0);

      return real_set_interval(handler, delay, ...args);
    }) as typeof window.setInterval;
  });

  afterEach(() => {
    const mounted = root;

    root = null;
    if (mounted) act(() => mounted.unmount());
    window.setInterval = real_set_interval;
  });

  it("follows expand, collapse and mark read without waiting for a timer", async () => {
    const view = render_viewer(`m${THREAD_SIZE - 1}`);

    await settle();

    expect(view().thread_messages).toHaveLength(THREAD_SIZE);
    expect(view().thread_expand_state).toEqual(getters(view));
    expect(view().thread_expand_state).toEqual({
      all_expanded: false,
      all_collapsed: false,
      has_unread: true,
    });

    act(() => list(view).expand_all());
    expect(view().thread_expand_state).toEqual(getters(view));
    expect(view().thread_expand_state.all_expanded).toBe(true);

    act(() => list(view).collapse_all());
    expect(view().thread_expand_state).toEqual(getters(view));
    expect(view().thread_expand_state.all_expanded).toBe(false);

    act(() => list(view).mark_all_read());
    expect(view().thread_expand_state).toEqual(getters(view));
    expect(view().thread_expand_state.has_unread).toBe(false);

    expect(h.intervals.filter((delay) => delay < 1_000)).toEqual([]);
  });

  it("reports the new list state when another message is opened", async () => {
    const view = render_viewer(`m${THREAD_SIZE - 1}`);

    await settle();
    act(() => list(view).expand_all());
    expect(view().thread_expand_state.all_expanded).toBe(true);

    act(() => open_email("m3"));
    await settle();

    expect(view().thread_messages).toHaveLength(THREAD_SIZE);
    expect(view().thread_expand_state).toEqual(getters(view));
    expect(view().thread_expand_state.all_expanded).toBe(false);
    expect(h.intervals.filter((delay) => delay < 1_000)).toEqual([]);
  });

  it("reports a new unread message arriving in the open thread", () => {
    const states: ThreadExpandState[] = [];
    const ref: { current: ThreadMessagesListRef | null } = { current: null };
    const messages = (count: number): DecryptedThreadMessage[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        item_type: "received",
        sender_name: "Sender",
        sender_email: "sender@example.org",
        subject: "Weekly update",
        body: `Message number ${i}`,
        timestamp: timestamp(i),
        is_read: i < 3,
        is_starred: false,
        is_deleted: false,
        is_external: false,
      }));
    const render = (count: number) =>
      root!.render(
        createElement(ThreadMessagesList, {
          ref,
          on_expand_state_change: (state: ThreadExpandState) => {
            states.push(state);
          },
          hide_counter: true,
          current_user_email: "me@astermail.org",
          default_expanded_id: "n2",
          main_email_id: "n2",
          messages: messages(count),
          subject: "Weekly update",
        }),
      );

    act(() => {
      root = createRoot(document.createElement("div"));
      render(3);
    });

    expect(states.at(-1)).toEqual({
      all_expanded: false,
      all_collapsed: false,
      has_unread: false,
    });

    act(() => render(4));

    const { all_expanded, all_collapsed, has_unread } = ref.current!;

    expect(states.at(-1)).toEqual({ all_expanded, all_collapsed, has_unread });
    expect(has_unread).toBe(true);
    expect(states.filter((state) => state.has_unread)).toHaveLength(1);
  });
});
