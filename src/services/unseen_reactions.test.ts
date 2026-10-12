//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mark_reactions_seen: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/services/api/reactions", () => ({
  mark_reactions_seen: (...a: unknown[]) => hoisted.mark_reactions_seen(...a),
}));

vi.mock("@/services/api/request_cache", () => ({
  request_cache: { invalidate: (...a: unknown[]) => hoisted.invalidate(...a) },
}));

vi.mock("@/lib/ignore_error", () => ({
  ignore_error: vi.fn(),
}));

import {
  LIVE_SETTLE_MS,
  LOCAL_SEEN_HOLD_MS,
  acknowledge_unseen_reactions,
  has_unseen_reaction,
  ingest_unseen_reaction_flags,
  note_reaction_added,
  note_reaction_removed,
  note_reactions_seen,
  reset_unseen_reactions,
} from "./unseen_reactions";

describe("unseen reaction store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    reset_unseen_reactions();
    hoisted.mark_reactions_seen.mockReset();
    hoisted.mark_reactions_seen.mockResolvedValue({ data: { success: true } });
    hoisted.invalidate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks nothing when the server reports no unseen reactions", () => {
    ingest_unseen_reaction_flags([{ id: "m1", thread_token: "t1" }]);

    expect(has_unseen_reaction({ id: "m1", thread_token: "t1" })).toBe(false);
  });

  it("marks the reacted-to message and its conversation from list flags", () => {
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
    ]);

    expect(has_unseen_reaction({ id: "m1" })).toBe(true);
    expect(has_unseen_reaction({ id: "m2", thread_token: "t1" })).toBe(true);
    expect(has_unseen_reaction({ id: "m3", thread_token: "t2" })).toBe(false);
  });

  it("marks a grouped row when any grouped message is flagged", () => {
    ingest_unseen_reaction_flags([{ id: "m2", has_unseen_reaction: true }]);

    expect(
      has_unseen_reaction({ id: "m9", grouped_email_ids: ["m9", "m2"] }),
    ).toBe(true);
  });

  it("never marks a row in Trash or Spam", () => {
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
      { id: "m4", has_unseen_reaction: true, is_trashed: true },
    ]);

    expect(
      has_unseen_reaction({ id: "m1", thread_token: "t1", is_trashed: true }),
    ).toBe(false);
    expect(
      has_unseen_reaction({ id: "m1", thread_token: "t1", is_spam: true }),
    ).toBe(false);
    expect(has_unseen_reaction({ id: "m4" })).toBe(false);
  });

  it("clears the mark when a later list no longer flags the message", () => {
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
    ]);
    ingest_unseen_reaction_flags([{ id: "m1", thread_token: "t1" }]);

    expect(has_unseen_reaction({ id: "m1", thread_token: "t1" })).toBe(false);
  });

  it("marks a row as soon as a live reaction arrives", () => {
    note_reaction_added({ reaction_id: "r1", target_id: "m1" });

    expect(has_unseen_reaction({ id: "m1" })).toBe(true);
    expect(has_unseen_reaction({ id: "m2" })).toBe(false);
    expect(hoisted.invalidate).toHaveBeenCalledWith("/mail/v1/messages");
  });

  it("marks the conversation of a live reaction by thread token", () => {
    note_reaction_added({
      reaction_id: "r1",
      target_id: "m1",
      thread_token: "t1",
    });

    expect(has_unseen_reaction({ id: "m5", thread_token: "t1" })).toBe(true);
  });

  it("ignores a live reaction with no target and no conversation", () => {
    note_reaction_added({ reaction_id: "r1" });
    note_reaction_added({ reaction_id: "", target_id: "m1" });

    expect(has_unseen_reaction({ id: "m1" })).toBe(false);
  });

  it("keeps a fresh live mark when a stale list arrives, then lets the server settle it", () => {
    note_reaction_added({ reaction_id: "r1", target_id: "m1" });
    ingest_unseen_reaction_flags([{ id: "m1" }]);

    expect(has_unseen_reaction({ id: "m1" })).toBe(true);

    vi.advanceTimersByTime(LIVE_SETTLE_MS + 1);
    ingest_unseen_reaction_flags([{ id: "m1" }]);

    expect(has_unseen_reaction({ id: "m1" })).toBe(false);
  });

  it("removes the mark when the reaction is taken back", () => {
    note_reaction_added({ reaction_id: "r1", target_id: "m1" });
    note_reaction_removed("r1");

    expect(has_unseen_reaction({ id: "m1" })).toBe(false);
  });

  it("keeps the mark while another unseen reaction remains", () => {
    note_reaction_added({ reaction_id: "r1", target_id: "m1" });
    note_reaction_added({ reaction_id: "r2", target_id: "m1" });
    note_reaction_removed("r1");

    expect(has_unseen_reaction({ id: "m1" })).toBe(true);
  });

  it("clears the mark when another device reports it seen", () => {
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
    ]);
    note_reaction_added({ reaction_id: "r1", target_id: "m1" });
    note_reactions_seen({ target_id: "m1", thread_token: "t1" });

    expect(has_unseen_reaction({ id: "m1", thread_token: "t1" })).toBe(false);
    expect(has_unseen_reaction({ id: "m2", thread_token: "t1" })).toBe(false);
  });

  it("acknowledges once, clears locally, and tells the server", async () => {
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
    ]);

    acknowledge_unseen_reactions({
      target_ids: ["m1", "m1"],
      thread_token: "t1",
    });
    acknowledge_unseen_reactions({ target_ids: ["m1"], thread_token: "t1" });

    expect(has_unseen_reaction({ id: "m1", thread_token: "t1" })).toBe(false);
    expect(hoisted.mark_reactions_seen).toHaveBeenCalledTimes(1);
    expect(hoisted.mark_reactions_seen).toHaveBeenCalledWith({
      thread_token: "t1",
      target_message_ids: ["m1"],
    });

    await vi.runAllTimersAsync();
  });

  it("does not call the server with nothing to acknowledge", () => {
    acknowledge_unseen_reactions({ target_ids: ["", ""] });

    expect(hoisted.mark_reactions_seen).not.toHaveBeenCalled();
  });

  it("holds the cleared state against a list fetched before the acknowledgment landed", async () => {
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
    ]);
    acknowledge_unseen_reactions({ target_ids: ["m1"], thread_token: "t1" });
    await Promise.resolve();
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
    ]);

    expect(has_unseen_reaction({ id: "m1", thread_token: "t1" })).toBe(false);

    vi.advanceTimersByTime(LOCAL_SEEN_HOLD_MS + 1);
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
    ]);

    expect(has_unseen_reaction({ id: "m1", thread_token: "t1" })).toBe(true);
  });

  it("shows a reaction that arrives right after an acknowledgment", () => {
    acknowledge_unseen_reactions({ target_ids: ["m1"], thread_token: "t1" });
    note_reaction_added({
      reaction_id: "r2",
      target_id: "m1",
      thread_token: "t1",
    });

    expect(has_unseen_reaction({ id: "m1", thread_token: "t1" })).toBe(true);
  });

  it("stays cleared and does not throw when the server rejects the acknowledgment", async () => {
    hoisted.mark_reactions_seen.mockRejectedValue(new Error("not found"));
    note_reaction_added({ reaction_id: "r1", target_id: "m1" });
    acknowledge_unseen_reactions({ target_ids: ["m1"] });
    await vi.runAllTimersAsync();

    expect(has_unseen_reaction({ id: "m1" })).toBe(false);

    acknowledge_unseen_reactions({ target_ids: ["m1"] });

    expect(hoisted.mark_reactions_seen).toHaveBeenCalledTimes(2);
  });

  it("sends at most 200 targets in one acknowledgment", () => {
    const ids = Array.from({ length: 250 }, (_, index) => `m${index}`);

    acknowledge_unseen_reactions({ target_ids: ids });

    expect(
      hoisted.mark_reactions_seen.mock.calls[0][0].target_message_ids,
    ).toHaveLength(200);
  });

  it("forgets everything on sign-out", () => {
    ingest_unseen_reaction_flags([
      { id: "m1", thread_token: "t1", has_unseen_reaction: true },
    ]);
    note_reaction_added({ reaction_id: "r1", target_id: "m2" });
    reset_unseen_reactions();

    expect(has_unseen_reaction({ id: "m1", thread_token: "t1" })).toBe(false);
    expect(has_unseen_reaction({ id: "m2" })).toBe(false);
  });
});
