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
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/api/mail", () => ({
  bulk_action_by_scope: vi.fn(),
}));

vi.mock("@/services/read_intent", () => ({
  note_flag_intents: vi.fn(),
  clear_flag_intents: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  get_category_action_ids: vi.fn(),
  get_index_entries: vi.fn(),
  is_fully_built: vi.fn(),
  is_index_capped: vi.fn(),
  remove_ids: vi.fn(),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

vi.mock("@/hooks/email_list_cache", () => ({
  stale_all_view_caches: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

import {
  run_category_scope_action,
  CATEGORY_ACTION_CHUNK_SIZE,
} from "./category_bulk_actions";

import { bulk_action_by_scope } from "@/services/api/mail";
import { clear_flag_intents, note_flag_intents } from "@/services/read_intent";
import {
  get_category_action_ids,
  get_index_entries,
  is_fully_built,
  is_index_capped,
  remove_ids,
  reindex_ids,
  set_ids_read,
} from "@/services/category_index";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";

const mock_scope = vi.mocked(bulk_action_by_scope);
const mock_action_ids = vi.mocked(get_category_action_ids);
const mock_fully_built = vi.mocked(is_fully_built);
const mock_capped = vi.mocked(is_index_capped);
const mock_remove_ids = vi.mocked(remove_ids);
const mock_reindex_ids = vi.mocked(reindex_ids);
const mock_index_entries = vi.mocked(get_index_entries);
const mock_set_ids_read = vi.mocked(set_ids_read);

function make_ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `id_${i}`);
}

function set_read_states(states: Record<string, boolean>) {
  mock_index_entries.mockImplementation(
    (ids: string[]) =>
      ids.map((id) => ({ id, is_read: states[id] ?? false })) as ReturnType<
        typeof get_index_entries
      >,
  );
}

function set_index(ids: string[]) {
  mock_action_ids.mockReturnValue({
    rep_ids: ids.slice(0, Math.min(ids.length, 50)),
    all_ids: ids,
  });
}

function ok_response(completed = true) {
  return {
    data: {
      batch_id: "batch",
      affected_count: 0,
      undoable: true,
      completed,
    },
  };
}

function sent_ids(): string[] {
  return mock_scope.mock.calls.flatMap((c) => c[0].ids ?? []);
}

beforeEach(() => {
  vi.clearAllMocks();
  set_read_states({});
  mock_fully_built.mockReturnValue(true);
  mock_capped.mockReturnValue(false);
  mock_scope.mockResolvedValue(ok_response());
});

describe("run_category_scope_action", () => {
  it("returns not_ready when the index is not built", async () => {
    mock_fully_built.mockReturnValue(false);

    const outcome = await run_category_scope_action("trash", "primary");

    expect(outcome).toBe("not_ready");
    expect(mock_scope).not.toHaveBeenCalled();
  });

  it("refuses every action when the index is capped", async () => {
    mock_capped.mockReturnValue(true);
    set_index(make_ids(3));

    for (const action of [
      "trash",
      "archive",
      "mark_spam",
      "mark_read",
      "mark_unread",
      "star",
    ] as const) {
      const outcome = await run_category_scope_action(action, "primary");

      expect(outcome).toBe("not_ready");
    }
    expect(mock_scope).not.toHaveBeenCalled();
  });

  it("returns unsupported for actions outside the category set", async () => {
    set_index(make_ids(3));

    const outcome = await run_category_scope_action("unarchive", "primary");

    expect(outcome).toBe("unsupported");
    expect(mock_scope).not.toHaveBeenCalled();
  });

  it("returns noop for an empty tab", async () => {
    set_index([]);

    const outcome = await run_category_scope_action("trash", "primary");

    expect(outcome).toBe("noop");
    expect(mock_scope).not.toHaveBeenCalled();
  });

  it("archives a tab of 12345 messages in requests of at most 1000 ids", async () => {
    const all_ids = make_ids(12_345);

    set_index(all_ids);

    const outcome = await run_category_scope_action("archive", "primary");

    expect(outcome).toBe("done");
    expect(CATEGORY_ACTION_CHUNK_SIZE).toBe(1000);
    expect(mock_scope).toHaveBeenCalledTimes(13);
    for (const [request] of mock_scope.mock.calls) {
      expect(request.action).toBe("archive");
      expect(request.scope).toEqual({});
      expect(request.ids!.length).toBeLessThanOrEqual(
        CATEGORY_ACTION_CHUNK_SIZE,
      );
    }
    expect(sent_ids()).toEqual(all_ids);
    expect(mock_remove_ids.mock.calls.flatMap((c) => c[0])).toEqual(all_ids);
    expect(vi.mocked(invalidate_mail_stats)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stale_all_view_caches)).toHaveBeenCalledTimes(1);
  });

  it("notes the archive intent before each request", async () => {
    const all_ids = make_ids(1500);

    set_index(all_ids);

    await run_category_scope_action("archive", "primary");

    expect(vi.mocked(note_flag_intents)).toHaveBeenCalledWith(
      all_ids.slice(0, 1000),
      { is_archived: true },
    );
    expect(vi.mocked(note_flag_intents)).toHaveBeenCalledWith(
      all_ids.slice(1000),
      { is_archived: true },
    );
    expect(vi.mocked(clear_flag_intents)).not.toHaveBeenCalled();
  });

  it("reports continuing when the server finishes a chunk in the background", async () => {
    set_index(make_ids(2500));
    mock_scope
      .mockResolvedValueOnce(ok_response())
      .mockResolvedValueOnce(ok_response(false))
      .mockResolvedValueOnce(ok_response());

    const outcome = await run_category_scope_action("archive", "primary");

    expect(outcome).toBe("continuing");
    expect(mock_scope).toHaveBeenCalledTimes(3);
  });

  it("stops at a failed chunk and keeps the chunks that were applied", async () => {
    const all_ids = make_ids(2500);

    set_index(all_ids);
    mock_scope
      .mockResolvedValueOnce(ok_response())
      .mockResolvedValueOnce({ error: "rate limited" });

    const progress: Array<[number, number]> = [];

    await expect(
      run_category_scope_action("trash", "primary", {
        on_progress: (completed, total) => progress.push([completed, total]),
      }),
    ).rejects.toThrow();

    expect(mock_scope).toHaveBeenCalledTimes(2);
    expect(mock_remove_ids.mock.calls.flatMap((c) => c[0])).toEqual(
      all_ids.slice(0, 1000),
    );
    expect(vi.mocked(clear_flag_intents)).toHaveBeenCalledWith(
      all_ids.slice(1000, 2000),
      { is_trashed: true },
    );
    expect(progress[progress.length - 1]).toEqual([1000, 2500]);
    expect(vi.mocked(invalidate_mail_stats)).toHaveBeenCalledTimes(1);
  });

  it("leaves the index and stats alone when the first chunk fails", async () => {
    set_index(make_ids(150));
    mock_scope.mockResolvedValue({ error: "boom" });

    await expect(
      run_category_scope_action("archive", "primary"),
    ).rejects.toThrow();
    expect(mock_remove_ids).not.toHaveBeenCalled();
    expect(vi.mocked(invalidate_mail_stats)).not.toHaveBeenCalled();
  });

  it("marks spam and removes ids from the index", async () => {
    const all_ids = make_ids(5);

    set_index(all_ids);

    const outcome = await run_category_scope_action("mark_spam", "primary");

    expect(outcome).toBe("done");
    expect(mock_scope).toHaveBeenCalledWith({
      action: "mark_spam",
      scope: {},
      ids: all_ids,
    });
    expect(mock_remove_ids.mock.calls.flatMap((c) => c[0])).toEqual(all_ids);
  });

  it("updates the index in place after a read change instead of reindexing", async () => {
    const all_ids = make_ids(1200);

    set_index(all_ids);

    const outcome = await run_category_scope_action("mark_read", "primary");

    expect(outcome).toBe("done");
    expect(mock_scope).toHaveBeenCalledWith({
      action: "mark_read",
      scope: {},
      ids: all_ids.slice(0, 1000),
    });
    expect(mock_set_ids_read.mock.calls.flatMap((c) => c[0])).toEqual(all_ids);
    for (const call of mock_set_ids_read.mock.calls) {
      expect(call[1]).toBe(true);
    }
    expect(mock_remove_ids).not.toHaveBeenCalled();
    expect(mock_reindex_ids).not.toHaveBeenCalled();
  });

  it("only sends the messages whose read state actually changes", async () => {
    set_index(make_ids(4));
    set_read_states({ id_0: true, id_2: true });

    const outcome = await run_category_scope_action("mark_read", "primary");

    expect(outcome).toBe("done");
    expect(sent_ids()).toEqual(["id_1", "id_3"]);
    expect(mock_set_ids_read).toHaveBeenCalledWith(["id_1", "id_3"], true);
  });

  it("returns noop when every message already has the target read state", async () => {
    set_index(make_ids(3));
    set_read_states({ id_0: true, id_1: true, id_2: true });

    const outcome = await run_category_scope_action("mark_read", "primary");

    expect(outcome).toBe("noop");
    expect(mock_scope).not.toHaveBeenCalled();
    expect(mock_set_ids_read).not.toHaveBeenCalled();
  });

  it("marks unread messages that are currently read", async () => {
    const all_ids = make_ids(120);

    set_index(all_ids);
    set_read_states(Object.fromEntries(all_ids.map((id) => [id, true])));

    await run_category_scope_action("mark_unread", "primary");

    expect(mock_scope).toHaveBeenCalledWith({
      action: "mark_unread",
      scope: {},
      ids: all_ids,
    });
    expect(mock_set_ids_read).toHaveBeenCalledWith(all_ids, false);
    expect(mock_reindex_ids).not.toHaveBeenCalled();
  });

  it("reindexes after star updates instead of removing", async () => {
    const all_ids = make_ids(120);

    set_index(all_ids);

    await run_category_scope_action("star", "primary");

    expect(mock_scope).toHaveBeenCalledWith({
      action: "star",
      scope: {},
      ids: all_ids,
    });
    expect(mock_remove_ids).not.toHaveBeenCalled();
    expect(mock_reindex_ids).toHaveBeenCalledWith(all_ids);
  });

  it("reports progress from zero through the full message count", async () => {
    const all_ids = make_ids(2500);
    const progress: Array<[number, number]> = [];

    set_index(all_ids);

    await run_category_scope_action("trash", "primary", {
      on_progress: (completed, total) => progress.push([completed, total]),
    });

    expect(progress).toEqual([
      [0, 2500],
      [1000, 2500],
      [2000, 2500],
      [2500, 2500],
    ]);
  });
});
