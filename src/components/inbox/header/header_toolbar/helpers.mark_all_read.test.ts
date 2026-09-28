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
import { describe, it, expect, beforeEach, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  calls: [] as string[],
  bulk_action_by_scope: vi.fn(),
  bulk_undo: vi.fn(),
  set_all_indexed_read: vi.fn(),
  set_ids_read: vi.fn(),
  adjust_stats_unread: vi.fn(),
  emit_mail_item_updated: vi.fn(),
  show_toast: vi.fn(),
  show_action_toast: vi.fn(),
  view_cache: new Map<string, { state: { emails: unknown[] } }>(),
}));

vi.mock("@/services/api/mail", () => ({
  bulk_action_by_scope: (...a: unknown[]) => {
    hoisted.calls.push("request");

    return hoisted.bulk_action_by_scope(...a);
  },
  bulk_undo: (...a: unknown[]) => hoisted.bulk_undo(...a),
}));

vi.mock("@/hooks/email_list_cache", () => ({
  stale_all_view_caches: vi.fn(),
  view_cache: hoisted.view_cache,
}));

vi.mock("@/services/category_index", () => ({
  set_all_indexed_read: (...a: unknown[]) => hoisted.set_all_indexed_read(...a),
  set_ids_read: (...a: unknown[]) => hoisted.set_ids_read(...a),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (...a: unknown[]) => hoisted.show_action_toast(...a),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_unread: (...a: unknown[]) => {
    hoisted.calls.push(`adjust:${a[0]}`);
    hoisted.adjust_stats_unread(...a);
  },
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({ use_i18n: vi.fn() }));

vi.mock("@/services/bulk_mail_scan", () => ({ FULL_MAILBOX_ITEM_CAP: 1000 }));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...a: unknown[]) => hoisted.show_toast(...a),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_mail_item_updated: (...a: unknown[]) =>
    hoisted.emit_mail_item_updated(...a),
  emit_mail_soft_refresh: vi.fn(),
}));

import { mark_all_read_by_scope } from "./helpers";

import {
  apply_flag_intents,
  clear_all_read_intents,
  get_read_intent,
  note_read_intent,
} from "@/services/read_intent";

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    item_type: "received",
    is_read: false,
    is_trashed: false,
    raw_timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const t = ((key: string) => key) as unknown as Parameters<
  typeof mark_all_read_by_scope
>[0];

describe("mark_all_read_by_scope", () => {
  beforeEach(() => {
    hoisted.calls.length = 0;
    hoisted.view_cache.clear();
    clear_all_read_intents();
    for (const fn of Object.values(hoisted)) {
      if (typeof fn === "function" && "mockReset" in fn) fn.mockReset();
    }
    hoisted.set_all_indexed_read.mockImplementation(() => {
      note_read_intent(["r1", "r2"], true);

      return ["r1", "r2"];
    });
  });

  it("marks rows and the count read before the request", async () => {
    hoisted.bulk_action_by_scope.mockResolvedValue({
      data: {
        batch_id: "b1",
        affected_count: 2,
        undoable: true,
        completed: true,
      },
    });

    await mark_all_read_by_scope(t);

    expect(hoisted.calls[0]).toBe("adjust:-2");
    expect(hoisted.calls[1]).toBe("request");
    expect(hoisted.adjust_stats_unread).toHaveBeenCalledTimes(1);
    expect(hoisted.emit_mail_item_updated).toHaveBeenCalledWith({
      id: "r1",
      is_read: true,
    });
    expect(get_read_intent("r1")).toBe(true);
  });

  it("adjusts only the remainder when the server marks more", async () => {
    hoisted.bulk_action_by_scope.mockResolvedValue({
      data: {
        batch_id: "b1",
        affected_count: 5,
        undoable: false,
        completed: true,
      },
    });

    await mark_all_read_by_scope(t);

    expect(hoisted.adjust_stats_unread.mock.calls).toEqual([[-2], [-3]]);
  });

  it("rolls rows, intents, and the count back when the request fails", async () => {
    hoisted.bulk_action_by_scope.mockResolvedValue({ error: "failed" });
    hoisted.set_ids_read.mockImplementation((ids: string[], is_read) =>
      note_read_intent(ids, is_read as boolean),
    );

    await mark_all_read_by_scope(t);

    expect(hoisted.set_ids_read).toHaveBeenCalledWith(["r1", "r2"], false);
    expect(hoisted.adjust_stats_unread.mock.calls).toEqual([[-2], [2]]);
    expect(hoisted.emit_mail_item_updated).toHaveBeenCalledWith({
      id: "r2",
      is_read: false,
    });
    expect(get_read_intent("r1")).toBeUndefined();
    expect(hoisted.show_toast).toHaveBeenCalledWith("failed", "error");
  });

  it("rolls back when the request throws", async () => {
    hoisted.bulk_action_by_scope.mockRejectedValue(new Error("offline"));

    await mark_all_read_by_scope(t);

    expect(hoisted.adjust_stats_unread.mock.calls).toEqual([[-2], [2]]);
    expect(hoisted.show_toast).toHaveBeenCalledWith(
      "common.something_went_wrong",
      "error",
    );
  });

  it("marks all read when only part of the folder is cached", async () => {
    hoisted.view_cache.set("inbox", {
      state: {
        emails: [
          row("r1"),
          row("c1"),
          row("c2", { is_read: true }),
          row("s1", { item_type: "sent" }),
          row("t1", { is_trashed: true }),
        ],
      },
    });

    let settle: (value: unknown) => void = () => {};

    hoisted.bulk_action_by_scope.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const pending = mark_all_read_by_scope(t);

    expect(hoisted.calls[0]).toBe("adjust:-3");
    expect(hoisted.emit_mail_item_updated).toHaveBeenCalledWith({
      id: "c1",
      is_read: true,
    });
    expect(hoisted.emit_mail_item_updated).not.toHaveBeenCalledWith({
      id: "s1",
      is_read: true,
    });
    expect(get_read_intent("c1")).toBe(true);

    const later = apply_flag_intents([
      row("u1"),
      row("u2", { raw_timestamp: "2999-01-01T00:00:00Z" }),
      row("u3", { item_type: "sent" }),
    ]);

    expect(later.map((email) => email.is_read)).toEqual([true, false, false]);

    settle({ error: "failed" });
    await pending;

    expect(hoisted.adjust_stats_unread.mock.calls).toEqual([[-3], [3]]);
    expect(hoisted.emit_mail_item_updated).toHaveBeenCalledWith({
      id: "c1",
      is_read: false,
    });
    expect(get_read_intent("c1")).toBeUndefined();
    expect(apply_flag_intents([row("u1")])[0].is_read).toBe(false);
  });
});
