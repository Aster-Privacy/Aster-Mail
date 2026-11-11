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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  stop_queued_send_draft_recheck,
  queued_send_draft_ids,
  on_queued_send_drafts_changed,
  mark_queued_send_delivered,
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

  afterEach(() => {
    stop_queued_send_draft_recheck();
    vi.useRealTimers();
  });

  it("deletes the draft once a send that was still pending is delivered", async () => {
    vi.useFakeTimers();
    remember_queued_send_draft("q1", "d1");
    get_status.mockResolvedValue({ data: { status: "pending" } });
    delete_draft.mockResolvedValue({ data: { success: true } });

    await settle_queued_send_drafts();

    expect(delete_draft).not.toHaveBeenCalled();

    get_status.mockResolvedValue({ data: { status: "sent" } });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(delete_draft).toHaveBeenCalledWith("d1");
    expect(stored_queue_ids()).toEqual([]);

    get_status.mockClear();
    await vi.advanceTimersByTimeAsync(600_000);

    expect(get_status).not.toHaveBeenCalled();
  });

  it("keeps a delivered draft out of the list while it is being deleted", () => {
    remember_queued_send_draft("q9", "d9");
    mark_queued_send_delivered("q9");
    forget_queued_send_draft("q9");

    expect(stored_queue_ids()).toEqual([]);
    expect(queued_send_draft_ids().has("d9")).toBe(true);
  });

  it("stops rechecking when asked to", async () => {
    vi.useFakeTimers();
    remember_queued_send_draft("q1", "d1");
    get_status.mockResolvedValue({ data: { status: "pending" } });

    await settle_queued_send_drafts();
    stop_queued_send_draft_recheck();
    get_status.mockClear();
    await vi.advanceTimersByTimeAsync(600_000);

    expect(get_status).not.toHaveBeenCalled();
  });

  it("lists the drafts of sends in flight and tells listeners", () => {
    const listener = vi.fn();
    const stop = on_queued_send_drafts_changed(listener);

    remember_queued_send_draft("q7", "d7");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(queued_send_draft_ids().has("d7")).toBe(true);
    expect(queued_send_draft_ids(Date.now() + 11 * 60 * 1000).has("d7")).toBe(
      false,
    );

    forget_queued_send_draft("q7");

    expect(listener).toHaveBeenCalledTimes(2);
    expect(queued_send_draft_ids().has("d7")).toBe(false);

    stop();
    remember_queued_send_draft("q2", "d2");

    expect(listener).toHaveBeenCalledTimes(2);
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
