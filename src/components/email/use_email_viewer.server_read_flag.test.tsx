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
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const update_item_metadata = vi.fn();
let server_is_read: boolean | undefined = false;
let metadata_is_read = true;

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
  build_single_thread_message: () => null,
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
  get_mail_item: async () => ({
    data: {
      id: "m1",
      item_type: "received",
      encrypted_envelope: "envelope",
      envelope_nonce: "nonce",
      is_external: false,
      is_read: server_is_read,
      metadata: { is_read: metadata_is_read },
      labels: [],
    },
    error: null,
  }),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: (...args: unknown[]) => update_item_metadata(...args),
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: vi.fn(),
}));

vi.mock("@/services/thread_service", () => ({
  fetch_and_decrypt_thread_messages: async () => [],
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
      mark_as_read_delay: "immediate",
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

function render_hook(): { read_states: boolean[]; root: Root } {
  const read_states: boolean[] = [];

  function Harness() {
    const view = use_email_viewer({ email_id: "m1", on_dismiss: () => {} });

    read_states.push(view.email?.is_read ?? false);

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { read_states, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
  });
}

describe("opening a message trusts the server read flag", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    update_item_metadata.mockReset();
    update_item_metadata.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the message read when the server says unread but the metadata says read", async () => {
    server_is_read = false;
    metadata_is_read = true;

    const { root } = render_hook();

    await flush();

    expect(update_item_metadata).toHaveBeenCalledWith(
      "m1",
      expect.anything(),
      { is_read: true },
    );

    act(() => root.unmount());
  });

  it("does not mark again when the server already says read", async () => {
    server_is_read = true;
    metadata_is_read = false;

    const { read_states, root } = render_hook();

    await flush();

    expect(update_item_metadata).not.toHaveBeenCalled();
    expect(read_states.at(-1)).toBe(true);

    act(() => root.unmount());
  });

  it("falls back to the metadata when the server omits the flag", async () => {
    server_is_read = undefined;
    metadata_is_read = false;

    const { root } = render_hook();

    await flush();

    expect(update_item_metadata).toHaveBeenCalledWith(
      "m1",
      expect.anything(),
      { is_read: true },
    );

    act(() => root.unmount());
  });
});
