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
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  permanent_delete_mail_item: vi.fn(),
  batched_bulk_permanent_delete: vi.fn(),
}));
const stats = vi.hoisted(() => ({ adjust_stats_trash: vi.fn() }));
const events = vi.hoisted(() => ({
  emit_mail_items_removed: vi.fn(),
  emit_mail_changed: vi.fn(),
}));

vi.mock("@/services/api/mail", () => api);
vi.mock("@/hooks/use_mail_stats", () => stats);
vi.mock("@/hooks/mail_events", () => events);

const {
  is_mail_item_in_trash,
  is_thread_message_in_trash,
  is_list_email_in_trash,
  trashed_conversation_ids,
  permanently_delete_message_ids,
} = await import("./trash_placement");

describe("is_mail_item_in_trash", () => {
  it("trusts the server flag over stale metadata", () => {
    expect(
      is_mail_item_in_trash({
        is_trashed: true,
        metadata: { is_trashed: false },
      }),
    ).toBe(true);
    expect(
      is_mail_item_in_trash({
        is_trashed: false,
        metadata: { is_trashed: true },
      }),
    ).toBe(false);
  });

  it("falls back to metadata when the server flag is missing", () => {
    expect(is_mail_item_in_trash({ metadata: { is_trashed: true } })).toBe(
      true,
    );
    expect(is_mail_item_in_trash(null)).toBe(false);
  });
});

describe("is_thread_message_in_trash", () => {
  it("uses the message's own flag", () => {
    expect(
      is_thread_message_in_trash({ id: "a", is_trashed: true }, "b", null),
    ).toBe(true);
    expect(
      is_thread_message_in_trash({ id: "a", is_trashed: false }, "a", {
        is_trashed: true,
      }),
    ).toBe(false);
  });

  it("uses the opened item only for the opened message", () => {
    expect(
      is_thread_message_in_trash({ id: "a" }, "a", { is_trashed: true }),
    ).toBe(true);
    expect(
      is_thread_message_in_trash({ id: "b" }, "a", { is_trashed: true }),
    ).toBe(false);
  });
});

describe("is_list_email_in_trash", () => {
  it("decides from the email, not the route", () => {
    expect(is_list_email_in_trash({ is_trashed: true }, "search")).toBe(true);
    expect(is_list_email_in_trash({ is_trashed: true }, "tag-work")).toBe(true);
    expect(is_list_email_in_trash({ is_trashed: false }, "trash")).toBe(false);
  });

  it("falls back to the route when the email has no flag", () => {
    expect(is_list_email_in_trash({}, "trash")).toBe(true);
    expect(is_list_email_in_trash({}, "inbox")).toBe(false);
  });
});

describe("trashed_conversation_ids", () => {
  it("keeps only trashed siblings and skips drafts", () => {
    expect(
      trashed_conversation_ids("a", { is_trashed: true }, [
        { id: "a" },
        { id: "b", is_trashed: true },
        { id: "c", is_trashed: false },
        { id: "d", is_trashed: true, item_type: "draft" },
      ]),
    ).toEqual(["a", "b"]);
  });
});

describe("permanently_delete_message_ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes one message through the single endpoint", async () => {
    api.permanent_delete_mail_item.mockResolvedValue({ data: { ok: true } });

    expect(await permanently_delete_message_ids(["a", "a"])).toBe(true);
    expect(api.permanent_delete_mail_item).toHaveBeenCalledWith("a");
    expect(api.batched_bulk_permanent_delete).not.toHaveBeenCalled();
    expect(stats.adjust_stats_trash).toHaveBeenCalledWith(-1);
    expect(events.emit_mail_items_removed).toHaveBeenCalledWith({ ids: ["a"] });
  });

  it("deletes several messages through the bulk endpoint", async () => {
    api.batched_bulk_permanent_delete.mockResolvedValue({
      success: true,
      failed_ids: [],
    });

    expect(await permanently_delete_message_ids(["a", "b"])).toBe(true);
    expect(api.batched_bulk_permanent_delete).toHaveBeenCalledWith(["a", "b"]);
    expect(stats.adjust_stats_trash).toHaveBeenCalledWith(-2);
  });

  it("leaves counts alone when the server refuses", async () => {
    api.permanent_delete_mail_item.mockResolvedValue({ error: "nope" });

    expect(await permanently_delete_message_ids(["a"])).toBe(false);
    expect(stats.adjust_stats_trash).not.toHaveBeenCalled();
    expect(events.emit_mail_items_removed).not.toHaveBeenCalled();
  });

  it("does nothing for an empty list", async () => {
    expect(await permanently_delete_message_ids([])).toBe(false);
    expect(api.permanent_delete_mail_item).not.toHaveBeenCalled();
  });
});
