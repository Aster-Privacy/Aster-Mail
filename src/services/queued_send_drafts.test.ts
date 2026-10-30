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

const get_status = vi.fn();
const delete_draft = vi.fn();
const emit_drafts_changed = vi.fn();

vi.mock("@/services/api/undo_send", () => ({
  undo_send_api: { get_status: (...args: unknown[]) => get_status(...args) },
}));

vi.mock("@/services/api/multi_drafts", () => ({
  delete_draft: (...args: unknown[]) => delete_draft(...args),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_drafts_changed: () => emit_drafts_changed(),
}));

const {
  remember_queued_send_draft,
  forget_queued_send_draft,
  settle_queued_send_drafts,
} = await import("@/services/queued_send_drafts");

const STORAGE_KEY = "astermail:queued_send_drafts";

function stored_queue_ids(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);

  return raw
    ? (JSON.parse(raw) as { queue_id: string }[]).map((e) => e.queue_id)
    : [];
}

describe("queued send drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("ignores a send without a saved draft", () => {
    remember_queued_send_draft("q1", undefined);

    expect(stored_queue_ids()).toEqual([]);
  });

  it("forgets a send once it settles in this tab", () => {
    remember_queued_send_draft("q1", "d1");
    remember_queued_send_draft("q2", "d2");
    forget_queued_send_draft("q1");

    expect(stored_queue_ids()).toEqual(["q2"]);
  });

  it("deletes the draft of a send the server delivered", async () => {
    remember_queued_send_draft("q1", "d1");
    get_status.mockResolvedValue({ data: { status: "sent" } });
    delete_draft.mockResolvedValue({ data: { success: true } });

    await settle_queued_send_drafts();

    expect(delete_draft).toHaveBeenCalledWith("d1");
    expect(emit_drafts_changed).toHaveBeenCalledTimes(1);
    expect(stored_queue_ids()).toEqual([]);
  });

  it("keeps the draft of a send that failed or was canceled", async () => {
    remember_queued_send_draft("q1", "d1");
    remember_queued_send_draft("q2", "d2");
    get_status.mockImplementation(async (id: string) => ({
      data: { status: id === "q1" ? "failed" : "cancelled" },
    }));

    await settle_queued_send_drafts();

    expect(delete_draft).not.toHaveBeenCalled();
    expect(stored_queue_ids()).toEqual([]);
  });

  it("keeps tracking a send whose status is pending or unknown", async () => {
    remember_queued_send_draft("q1", "d1");
    remember_queued_send_draft("q2", "d2");
    get_status.mockImplementation(async (id: string) =>
      id === "q1"
        ? { data: { status: "pending" } }
        : { error: "not found", code: "NOT_FOUND" },
    );

    await settle_queued_send_drafts();

    expect(delete_draft).not.toHaveBeenCalled();
    expect(stored_queue_ids()).toEqual(["q1", "q2"]);
  });
});
