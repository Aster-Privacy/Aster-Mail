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
import type { EmailDetailActionsDeps } from "@/components/email/hooks/email_detail_actions";
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const placement = vi.hoisted(() => ({
  permanently_delete_message_ids: vi.fn(async (_ids: string[]) => true),
}));

vi.mock(
  "@/components/email/viewer_shared/trash_placement",
  async (import_original) => ({
    ...(await import_original<
      typeof import("@/components/email/viewer_shared/trash_placement")
    >()),
    ...placement,
  }),
);

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: vi.fn(async () => ({ success: true, encrypted: null })),
  bulk_update_metadata_by_ids: async () => ({ success: true }),
}));

vi.mock("@/services/api/mail", () => ({
  report_spam_sender: vi.fn(),
  remove_spam_sender: vi.fn(),
}));

vi.mock("@/services/api/archive", () => ({
  batch_archive: vi.fn(),
  batch_unarchive: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({ reindex_ids: vi.fn() }));

vi.mock("@/hooks/use_stat_helpers", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/use_stat_helpers")>()),
  apply_stat_deltas: vi.fn(),
  revert_stat_deltas: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_unread: vi.fn(),
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/hooks/email_list_cache", () => ({
  remove_email_from_view_cache: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

const { use_email_detail_actions } =
  await import("@/components/email/hooks/email_detail_actions");

type Actions = ReturnType<typeof use_email_detail_actions>;

let latest!: Actions;
let root!: Root;
let confirm_setting: boolean | undefined;
const navigate = vi.fn();

function trashed_message(id: string): DecryptedThreadMessage {
  return {
    id,
    is_trashed: true,
    item_type: "received",
    encrypted_metadata: "meta",
    metadata_nonce: "nonce",
  } as unknown as DecryptedThreadMessage;
}

function Harness() {
  latest = use_email_detail_actions({
    email_id: "m1",
    mail_item: {
      id: "m1",
      item_type: "received",
      encrypted_metadata: "meta",
      metadata_nonce: "nonce",
      metadata_version: 1,
      is_trashed: true,
      metadata: { is_read: true, is_trashed: true },
    } as unknown as EmailDetailActionsDeps["mail_item"],
    email: null,
    thread_messages: [trashed_message("m1"), trashed_message("m2")],
    thread_ghost_email: undefined,
    is_archive_loading: false,
    is_trash_loading: false,
    set_is_archive_loading: () => {},
    set_is_archive_confirm_open: () => {},
    set_is_trash_loading: () => {},
    set_is_trash_confirm_open: () => {},
    set_thread_messages: () => {},
    set_reply_modal_data: () => {},
    set_is_reply_modal_open: () => {},
    set_is_forward_modal_open: () => {},
    set_forward_target: () => {},
    set_view_source_message: () => {},
    get_next_email_destination: () => "/trash",
    navigate,
    t: (key) => key,
    preferences_default_reply_behavior: "reply",
    confirm_before_permanent_delete: confirm_setting,
  });

  return null;
}

function render() {
  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(createElement(Harness));
  });
}

describe("permanent delete setting on the message page", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    placement.permanently_delete_message_ids.mockClear();
    navigate.mockClear();
    confirm_setting = undefined;
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("waits for your confirmation by default", async () => {
    render();
    await act(async () => {
      await latest.handle_trash();
    });

    expect(placement.permanently_delete_message_ids).not.toHaveBeenCalled();
    expect(latest.pending_permanent_delete_id).toBe("m1");

    await act(async () => {
      await latest.confirm_permanent_delete();
    });

    expect(placement.permanently_delete_message_ids).toHaveBeenCalledTimes(1);
    expect(latest.pending_permanent_delete_id).toBeNull();
  });

  it("deletes at once when the confirmation is turned off", async () => {
    confirm_setting = false;
    render();
    await act(async () => {
      await latest.handle_trash();
    });

    expect(placement.permanently_delete_message_ids).toHaveBeenCalledTimes(1);
    expect(latest.pending_permanent_delete_id).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/trash");
  });

  it("applies the same setting to one message in a conversation", async () => {
    confirm_setting = false;
    render();
    await act(async () => {
      await latest.handle_per_message_trash(trashed_message("m2"));
    });

    expect(placement.permanently_delete_message_ids).toHaveBeenCalledWith([
      "m2",
    ]);
    expect(latest.pending_permanent_delete_id).toBeNull();
  });
});
