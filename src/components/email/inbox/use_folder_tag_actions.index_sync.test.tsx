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

const mail_api = vi.hoisted(() => {
  const bulk_add_folder = vi.fn(
    async (
      _ids: string[],
      _folder_token: string,
    ): Promise<{ data?: unknown; error?: string }> => ({
      data: { status: "ok", affected: 3 },
    }),
  );
  const bulk_remove_folder = vi.fn(
    async (
      _ids: string[],
      _folder_token: string,
    ): Promise<{ data?: unknown; error?: string }> => ({
      data: { status: "ok", affected: 3 },
    }),
  );

  async function as_batched(
    call: () => Promise<{ error?: string }>,
    ids: string[],
  ) {
    const response = await call();
    const failed = Boolean(response.error);

    return {
      success: !failed,
      affected_total: failed ? 0 : ids.length,
      failed_ids: failed ? ids : [],
      was_cancelled: false,
    };
  }

  return {
    bulk_add_folder,
    bulk_remove_folder,
    batched_bulk_add_folder: vi.fn((ids: string[], folder_token: string) =>
      as_batched(() => bulk_add_folder(ids, folder_token), ids),
    ),
    batched_bulk_remove_folder: vi.fn((ids: string[], folder_token: string) =>
      as_batched(() => bulk_remove_folder(ids, folder_token), ids),
    ),
  };
});

const events_mock = vi.hoisted(() => ({
  removed_ids: [] as string[][],
  emit_mail_item_updated: vi.fn(),
}));

const toast_mock = vi.hoisted(() => ({
  last: null as { on_undo?: () => Promise<void> } | null,
}));

const index_mock = vi.hoisted(() => ({
  remove_ids: vi.fn(),
  reindex_ids: vi.fn(),
}));

vi.mock("@/services/api/mail", () => mail_api);

vi.mock("@/services/api/tags", () => ({
  bulk_add_tag: vi.fn(async () => ({ data: {} })),
  bulk_remove_tag: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: { MAIL_SOFT_REFRESH: "astermail:mail-soft-refresh" },
  emit_mail_item_updated: events_mock.emit_mail_item_updated,
  emit_mail_items_removed: (detail: { ids: string[] }) => {
    events_mock.removed_ids.push(detail.ids);
  },
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { on_undo?: () => Promise<void> }) => {
    toast_mock.last = opts;
  },
}));

vi.mock("@/services/category_index", () => index_mock);

import { use_folder_tag_actions } from "@/components/email/inbox/use_folder_tag_actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_folder_tag_actions>;

let hook: HookResult;

function Probe({ emails }: { emails: InboxEmail[] }) {
  hook = use_folder_tag_actions({
    t: (key: string) => key,
    current_view: "inbox",
    email_state: { emails, total_messages: emails.length },
    update_email: vi.fn(),
    folders_lookup: new Map([["tok", { name: "Receipts" }]]),
    tags_lookup: new Map(),
    is_drafts_view: false,
    is_scheduled_view: false,
  } as unknown as Parameters<typeof use_folder_tag_actions>[0]);

  return null;
}

const emails = [
  {
    id: "a1",
    is_selected: true,
    grouped_email_ids: ["a1", "a2"],
    folders: [],
  },
  { id: "b", is_selected: true, folders: [] },
] as unknown as InboxEmail[];

const all_ids = ["a1", "a2", "b"];

let container: HTMLDivElement;
let root: Root;

describe("use_folder_tag_actions category index sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events_mock.removed_ids = [];
    toast_mock.last = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(createElement(Probe, { emails }));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("removes all grouped sibling ids when moving to a folder from the inbox", async () => {
    await act(async () => {
      await hook.handle_toolbar_toggle_folder("tok", false);
    });

    expect(events_mock.removed_ids).toEqual([all_ids]);
    expect(mail_api.bulk_add_folder).toHaveBeenCalledWith(all_ids, "tok");
  });

  it("reindexes all grouped sibling ids on undo of a folder move", async () => {
    await act(async () => {
      await hook.handle_toolbar_toggle_folder("tok", false);
    });

    expect(toast_mock.last?.on_undo).toBeDefined();
    await act(async () => {
      await toast_mock.last!.on_undo!();
    });

    expect(mail_api.bulk_remove_folder).toHaveBeenCalledWith(all_ids, "tok");
    expect(index_mock.reindex_ids).toHaveBeenCalledWith(all_ids);
  });

  it("reindexes all grouped sibling ids when the folder move fails", async () => {
    mail_api.bulk_add_folder.mockResolvedValueOnce({ error: "boom" });

    await act(async () => {
      await hook.handle_toolbar_toggle_folder("tok", false);
    });

    expect(events_mock.removed_ids).toEqual([all_ids]);
    expect(index_mock.reindex_ids).toHaveBeenCalledWith(all_ids);
  });

  it("removes all grouped sibling ids from the index on undo of a folder removal", async () => {
    await act(async () => {
      await hook.handle_toolbar_toggle_folder("tok", true);
    });

    await act(async () => {
      await toast_mock.last!.on_undo!();
    });

    expect(mail_api.bulk_add_folder).toHaveBeenCalledWith(all_ids, "tok");
    expect(index_mock.remove_ids).toHaveBeenCalledWith(all_ids);
  });
});
