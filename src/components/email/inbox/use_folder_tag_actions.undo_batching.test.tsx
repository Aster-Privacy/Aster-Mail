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
  function batched(ids: string[], failed_ids: string[] = []) {
    return {
      success: failed_ids.length === 0,
      affected_total: ids.length - failed_ids.length,
      failed_ids,
      was_cancelled: false,
    };
  }

  return {
    batched_bulk_add_folder: vi.fn(
      async (ids: string[], _folder_token: string) => batched(ids),
    ),
    batched_bulk_remove_folder: vi.fn(
      async (ids: string[], _folder_token: string) => batched(ids),
    ),
  };
});

const toast_mock = vi.hoisted(() => ({
  last: null as { on_undo?: () => Promise<void> } | null,
}));

vi.mock("@/services/api/mail", () => mail_api);

vi.mock("@/services/api/tags", () => ({
  batched_bulk_add_tag: vi.fn(),
  batched_bulk_remove_tag: vi.fn(),
}));

vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: { MAIL_SOFT_REFRESH: "astermail:mail-soft-refresh" },
  emit_mail_item_updated: vi.fn(),
  emit_mail_items_removed: vi.fn(),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { on_undo?: () => Promise<void> }) => {
    toast_mock.last = opts;
  },
}));

vi.mock("@/services/category_index", () => ({
  remove_ids: vi.fn(),
  reindex_ids: vi.fn(),
}));

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
    current_view: "folder-work",
    email_state: { emails, total_messages: emails.length },
    update_email: vi.fn(),
    folders_lookup: new Map([
      ["work", { name: "Work" }],
      ["home", { name: "Home" }],
      ["archive_2025", { name: "2025" }],
    ]),
    tags_lookup: new Map(),
    is_drafts_view: false,
    is_scheduled_view: false,
  } as unknown as Parameters<typeof use_folder_tag_actions>[0]);

  return null;
}

function in_folder(id: string, folder_token: string, grouped?: string[]) {
  return {
    id,
    is_selected: true,
    grouped_email_ids: grouped,
    folders: [{ folder_token, name: folder_token }],
  };
}

function add_calls(): [string[], string][] {
  return mail_api.batched_bulk_add_folder.mock.calls.map(
    ([ids, token]) => [ids, token] as [string[], string],
  );
}

let container: HTMLDivElement;
let root: Root;

function render(emails: InboxEmail[]): void {
  act(() => {
    root.render(createElement(Probe, { emails }));
  });
}

async function move_then_undo(folder_token: string): Promise<void> {
  await act(async () => {
    await hook.handle_toolbar_toggle_folder(folder_token, false);
  });
  mail_api.batched_bulk_add_folder.mockClear();
  mail_api.batched_bulk_remove_folder.mockClear();
  await act(async () => {
    await toast_mock.last!.on_undo!();
  });
}

describe("use_folder_tag_actions undo of a folder move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast_mock.last = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("restores every conversation from one folder with a single request", async () => {
    const emails = Array.from({ length: 25 }, (_, i) =>
      in_folder(`m${i}`, "work"),
    ) as unknown as InboxEmail[];
    const ids = emails.map((e) => e.id);

    render(emails);
    await move_then_undo("home");

    expect(mail_api.batched_bulk_remove_folder).toHaveBeenCalledTimes(1);
    expect(mail_api.batched_bulk_remove_folder).toHaveBeenCalledWith(
      ids,
      "home",
    );
    expect(add_calls()).toEqual([[ids, "work"]]);
  });

  it("sends one request per previous folder, carrying grouped sibling ids", async () => {
    const emails = [
      in_folder("a1", "work", ["a1", "a2"]),
      in_folder("b", "archive_2025"),
      in_folder("c", "work"),
      { id: "d", is_selected: true, folders: [] },
    ] as unknown as InboxEmail[];

    render(emails);
    await move_then_undo("home");

    expect(add_calls()).toEqual([
      [["a1", "a2", "c"], "work"],
      [["b"], "archive_2025"],
    ]);
  });

  it("only restores the conversations whose move succeeded", async () => {
    const emails = [
      in_folder("a", "work"),
      in_folder("b", "work"),
      in_folder("c", "work"),
    ] as unknown as InboxEmail[];

    mail_api.batched_bulk_add_folder.mockResolvedValueOnce({
      success: false,
      affected_total: 2,
      failed_ids: ["b"],
      was_cancelled: false,
    });
    render(emails);
    await move_then_undo("home");

    expect(mail_api.batched_bulk_remove_folder).toHaveBeenCalledWith(
      ["a", "c"],
      "home",
    );
    expect(add_calls()).toEqual([[["a", "c"], "work"]]);
  });

  it("makes no restore request for conversations that had no folder", async () => {
    const emails = [
      { id: "a", is_selected: true, folders: [] },
      { id: "b", is_selected: true },
    ] as unknown as InboxEmail[];

    render(emails);
    await move_then_undo("home");

    expect(mail_api.batched_bulk_remove_folder).toHaveBeenCalledWith(
      ["a", "b"],
      "home",
    );
    expect(add_calls()).toEqual([]);
  });
});
