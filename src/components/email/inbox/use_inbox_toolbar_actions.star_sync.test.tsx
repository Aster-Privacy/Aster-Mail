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

const metadata_mock = vi.hoisted(() => ({
  bulk_update_metadata_by_ids: vi.fn(),
  bulk_update_items_metadata: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => metadata_mock);

vi.mock("@/services/api/mail", () => ({
  empty_spam: vi.fn(),
  report_spam_sender: vi.fn(async () => ({})),
  remove_spam_sender: vi.fn(async () => ({})),
  trash_thread: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
  hide_action_toast: vi.fn(),
  update_progress_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn(),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";
import { MAIL_EVENTS } from "@/hooks/mail_events";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_inbox_toolbar_actions>;

let hook: HookResult;
const update_email = vi.fn();

function Probe({ emails }: { emails: InboxEmail[] }) {
  hook = use_inbox_toolbar_actions({
    t: (key: string) => key,
    current_view: "inbox",
    email_state: { emails, total_messages: emails.length },
    get_selected_ids: (list: InboxEmail[]) =>
      list.filter((e) => e.is_selected).map((e) => e.id),
    update_email,
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    folders_lookup: new Map(),
    tags_lookup: new Map(),
    preferences: {
      confirm_before_delete: false,
      confirm_before_spam: false,
      confirm_before_archive: false,
      conversation_grouping: true,
    },
    update_preference: vi.fn(),
    save_now: vi.fn(),
    is_drafts_view: false,
    is_scheduled_view: false,
  } as unknown as Parameters<typeof use_inbox_toolbar_actions>[0]);

  return null;
}

const emails = [
  { id: "m1", is_selected: true, is_starred: false, is_read: true },
] as unknown as InboxEmail[];

let container: HTMLDivElement;
let root: Root;
let starred_events: boolean[];

function on_item_updated(event: Event) {
  const detail = (event as CustomEvent<{ id: string; is_starred?: boolean }>)
    .detail;

  if (detail.id === "m1" && detail.is_starred !== undefined) {
    starred_events.push(detail.is_starred);
  }
}

describe("use_inbox_toolbar_actions star keeps the open reader in sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    starred_events = [];
    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, on_item_updated);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(createElement(Probe, { emails }));
    });
  });

  afterEach(() => {
    window.removeEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, on_item_updated);
    act(() => root.unmount());
    container.remove();
  });

  it("tells the reader before the server answers", async () => {
    let resolve_update: (value: unknown) => void = () => {};

    metadata_mock.bulk_update_items_metadata.mockReturnValueOnce(
      new Promise((resolve) => {
        resolve_update = resolve;
      }),
    );

    let pending: Promise<void> = Promise.resolve();

    act(() => {
      pending = hook.handle_toolbar_toggle_star();
    });

    expect(starred_events).toEqual([true]);

    await act(async () => {
      resolve_update({ failed_ids: [], encrypted_by_id: new Map() });
      await pending;
    });

    expect(starred_events).toEqual([true, true]);
  });

  it("reverts the reader when the server rejects the change", async () => {
    metadata_mock.bulk_update_items_metadata.mockResolvedValueOnce({
      failed_ids: ["m1"],
      encrypted_by_id: new Map(),
    });

    await act(async () => {
      await hook.handle_toolbar_toggle_star();
    });

    expect(starred_events).toEqual([true, false]);
    expect(update_email).toHaveBeenLastCalledWith("m1", { is_starred: false });
  });
});
