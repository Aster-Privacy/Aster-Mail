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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const archive_api = vi.hoisted(() => ({
  batch_archive: vi.fn(async (_data: { ids: string[]; tier?: string }) => ({
    data: { success: true, archived_count: 1, total_size_bytes: 0 },
  })),
  batch_unarchive: vi.fn(async (_data: { ids: string[] }) => ({
    data: { success: true, unarchived_count: 1 },
  })),
}));

// The thread holds an older reply that is already in Archive alongside the
// new Inbox reply; thread messages report no archive state.
const mail_api = vi.hoisted(() => ({
  get_thread_messages: vi.fn(async () => ({
    data: {
      messages: [
        { id: "m_old", item_type: "received", is_trashed: false },
        { id: "m_new", item_type: "received", is_trashed: false },
      ],
    },
  })),
}));

const toast_mock = vi.hoisted(() => ({
  last: null as { on_undo?: () => Promise<void> } | null,
}));

vi.mock("@/services/api/archive", () => archive_api);
vi.mock("@/services/api/mail", () => mail_api);
vi.mock("@/services/crypto/mail_metadata", () => ({
  bulk_update_metadata_by_ids: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/services/read_intent", () => ({
  note_flag_intents: vi.fn(),
  clear_flag_intents: vi.fn(),
}));
vi.mock("@/services/category_index", () => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn(() => []),
  reindex_ids: vi.fn(),
}));
vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: { MAIL_SOFT_REFRESH: "astermail:mail-soft-refresh" },
  emit_mail_changed: vi.fn(),
  emit_mail_item_updated: vi.fn(),
}));
vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));
vi.mock("@/hooks/use_stat_helpers", () => ({
  compute_archive_deltas: vi.fn(() => ({})),
  apply_stat_deltas: vi.fn(),
  revert_stat_deltas: vi.fn(),
}));
vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { on_undo?: () => Promise<void> }) => {
    toast_mock.last = opts;
  },
}));
vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

import { use_archive_snooze_actions } from "@/components/email/inbox/use_archive_snooze_actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_archive_snooze_actions>;

let hook: HookResult;

function Probe({ pending }: { pending: InboxEmail }) {
  hook = use_archive_snooze_actions({
    t: (key: string) => key,
    current_view: "inbox",
    email_state: { emails: [pending], total_messages: 1 },
    get_selected_ids: () => [],
    update_email: vi.fn(),
    remove_email: vi.fn(),
    bulk_archive: vi.fn(),
    bulk_unarchive: vi.fn(),
    bulk_snooze_action: vi.fn(),
    preferences: { confirm_before_archive: true },
    update_preference: vi.fn(),
    save_now: vi.fn(),
    set_confirmations: vi.fn(),
    dont_ask_archive: false,
    set_dont_ask_archive: vi.fn(),
    pending_archive_email: pending,
    set_pending_archive_email: vi.fn(),
    set_show_single_archive_confirm: vi.fn(),
    dont_ask_single_archive: false,
    set_dont_ask_single_archive: vi.fn(),
  } as unknown as Parameters<typeof use_archive_snooze_actions>[0]);

  return null;
}

let container: HTMLDivElement;
let root: Root;

function mount(pending: InboxEmail) {
  act(() => {
    root.render(createElement(Probe, { pending }));
  });
}

async function archive_then_undo() {
  await act(async () => {
    await hook.confirm_single_archive();
  });
  expect(toast_mock.last?.on_undo).toBeTypeOf("function");
  await act(async () => {
    await toast_mock.last!.on_undo!();
  });
}

describe("confirm_single_archive undo scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast_mock.last = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not move an already-archived reply of the thread into the Inbox on Undo", async () => {
    mount({
      id: "m_new",
      thread_token: "thread-1",
      thread_message_count: 2,
      item_type: "received",
      is_read: true,
    } as unknown as InboxEmail);

    await archive_then_undo();

    expect(archive_api.batch_archive).toHaveBeenCalledTimes(1);
    expect(archive_api.batch_archive.mock.calls[0][0].ids).toEqual(["m_new"]);
    expect(archive_api.batch_unarchive).toHaveBeenCalledTimes(1);
    expect(archive_api.batch_unarchive.mock.calls[0][0].ids).toEqual(["m_new"]);
  });

  it("archives and restores every message the grouped row holds", async () => {
    mount({
      id: "m_new",
      grouped_email_ids: ["m_new", "m_mid"],
      thread_token: "thread-1",
      thread_message_count: 3,
      item_type: "received",
      is_read: true,
    } as unknown as InboxEmail);

    await archive_then_undo();

    expect(archive_api.batch_archive.mock.calls[0][0].ids).toEqual([
      "m_new",
      "m_mid",
    ]);
    expect(archive_api.batch_unarchive.mock.calls[0][0].ids).toEqual([
      "m_new",
      "m_mid",
    ]);
  });
});
