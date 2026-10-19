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
import type { ActionStateContext } from "./use_action_state";
import type { MetadataHelpers } from "./use_metadata_helpers";
import type { BulkActions } from "./use_bulk_actions";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  get_thread_messages: vi.fn(),
  bulk_update_metadata_by_ids: vi.fn(),
}));

vi.mock("@/services/api/mail", () => ({
  report_spam_sender: async () => ({ data: {} }),
  remove_spam_sender: async () => ({ data: {} }),
  batched_bulk_add_folder: async () => ({ data: {} }),
  batched_bulk_remove_folder: async () => ({ data: {} }),
  get_thread_messages: (...a: unknown[]) => hoisted.get_thread_messages(...a),
}));

vi.mock("@/services/api/archive", () => ({
  batch_archive: async () => ({ data: { success: true } }),
  batch_unarchive: async () => ({ data: { success: true } }),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  bulk_update_metadata_by_ids: (...a: unknown[]) =>
    hoisted.bulk_update_metadata_by_ids(...a),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: () => {},
  hide_action_toast: () => {},
  update_progress_toast: () => {},
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: () => {},
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  conversation_needs_thread_read: () => false,
  collect_conversation_thread_tokens: () => [],
  mark_conversation_threads_read: async () => ({
    attempted_ids: [],
    failed_ids: [],
  }),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_starred: () => {},
  adjust_stats_unread: () => {},
}));

vi.mock("@/native/capacitor_bridge", () => ({
  get_network_status: async () => ({ connected: true }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (k: string) => k }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { conversation_grouping: true },
  }),
}));

import { use_bulk_actions } from "./use_bulk_actions";

const DELAY_MS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function make_email(
  id: string,
  thread_token: string,
  grouped_email_ids?: string[],
): InboxEmail {
  return {
    id,
    item_type: "received",
    thread_token,
    thread_message_count: 3,
    grouped_email_ids,
    is_archived: false,
    is_trashed: false,
    is_spam: false,
  } as unknown as InboxEmail;
}

function thread_response(token: string, base_id: string) {
  return {
    data: {
      messages: [
        { id: base_id, item_type: "received" },
        { id: `${token}-a`, item_type: "received" },
        { id: `${token}-sent`, item_type: "sent" },
        { id: `${token}-b`, item_type: "received" },
      ],
    },
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_actions(): Promise<BulkActions> {
  let actions: BulkActions | null = null;
  const state_ctx = {
    set_action_loading: () => {},
    set_action_error: () => {},
    clear_action_state: () => {},
    create_pending_action: () => {},
    remove_pending_action: () => {},
    rollback_action: () => {},
    bulk_abort_ref: { current: new AbortController() },
    config: {},
  } as unknown as ActionStateContext;
  const metadata = {
    bulk_update_with_metadata: async () => ({ success: true, failed_ids: [] }),
  } as unknown as MetadataHelpers;

  function Harness() {
    actions = use_bulk_actions(state_ctx, metadata);

    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness />);
  });

  return actions!;
}

beforeEach(() => {
  hoisted.get_thread_messages.mockReset();
  hoisted.bulk_update_metadata_by_ids.mockReset();
  hoisted.bulk_update_metadata_by_ids.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("bulk archive sibling lookup", () => {
  it("fetches thread siblings with bounded concurrency", async () => {
    const thread_count = 12;
    let in_flight = 0;
    let max_in_flight = 0;

    hoisted.get_thread_messages.mockImplementation(async (token: string) => {
      in_flight += 1;
      max_in_flight = Math.max(max_in_flight, in_flight);
      await sleep(DELAY_MS);
      in_flight -= 1;

      return thread_response(token, `m-${token}`);
    });

    const emails = Array.from({ length: thread_count }, (_, i) =>
      make_email(`m-t${i}`, `t${i}`),
    );
    const actions = await render_actions();

    await act(async () => {
      await actions.bulk_archive(emails);
    });
    await vi.waitFor(() =>
      expect(hoisted.bulk_update_metadata_by_ids).toHaveBeenCalledTimes(1),
    );

    expect(hoisted.get_thread_messages).toHaveBeenCalledTimes(thread_count);
    expect(max_in_flight).toBe(4);
  });

  it("keeps sibling ids in selection order when responses arrive out of order", async () => {
    const delays: Record<string, number> = { t0: 40, t1: 5, t2: 25, t3: 0 };

    hoisted.get_thread_messages.mockImplementation(async (token: string) => {
      await sleep(delays[token]);

      return thread_response(token, `m-${token}`);
    });

    const emails = [
      make_email("m-t0", "t0", ["m-t0", "g-0"]),
      make_email("m-t1", "t1"),
      make_email("m-t2", "t2", ["m-t2", "g-2"]),
      make_email("m-t3", "t3"),
    ];
    const actions = await render_actions();

    await act(async () => {
      await actions.bulk_archive(emails);
    });
    await vi.waitFor(() =>
      expect(hoisted.bulk_update_metadata_by_ids).toHaveBeenCalledTimes(1),
    );

    expect(hoisted.bulk_update_metadata_by_ids).toHaveBeenCalledWith(
      [
        "g-0",
        "g-2",
        "t0-a",
        "t0-b",
        "t1-a",
        "t1-b",
        "t2-a",
        "t2-b",
        "t3-a",
        "t3-b",
      ],
      { is_archived: true },
    );
  });

  it("skips failed thread lookups and still syncs the rest", async () => {
    hoisted.get_thread_messages.mockImplementation(async (token: string) => {
      await sleep(1);
      if (token === "t1") throw new Error("network");
      if (token === "t2") return { error: "not found" };

      return thread_response(token, `m-${token}`);
    });

    const emails = [
      make_email("m-t0", "t0"),
      make_email("m-t1", "t1"),
      make_email("m-t2", "t2"),
      make_email("m-t3", "t3"),
    ];
    const actions = await render_actions();

    await act(async () => {
      await actions.bulk_unarchive(emails);
    });
    await vi.waitFor(() =>
      expect(hoisted.bulk_update_metadata_by_ids).toHaveBeenCalledTimes(1),
    );

    expect(hoisted.get_thread_messages).toHaveBeenCalledTimes(4);
    expect(hoisted.bulk_update_metadata_by_ids).toHaveBeenCalledWith(
      ["t0-a", "t0-b", "t3-a", "t3-b"],
      { is_archived: false },
    );
  });
});
