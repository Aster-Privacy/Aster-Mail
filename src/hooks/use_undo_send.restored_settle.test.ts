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

const mocks = vi.hoisted(() => ({
  emit_email_sent: vi.fn(),
  emit_thread_reply_sent: vi.fn(),
  invalidate_mail_stats: vi.fn(),
  server_sends: [] as { queue_id: string }[],
}));

vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/mail_events")>()),
  emit_email_sent: mocks.emit_email_sent,
  emit_thread_reply_sent: mocks.emit_thread_reply_sent,
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: mocks.invalidate_mail_stats,
}));

vi.mock("@/services/undo_send_manager", () => ({
  undo_send_manager: {
    get_all_sends: () => mocks.server_sends,
  },
}));

const STORAGE_KEY = "astermail:pending_sends";

function stored_send(id: string, thread_token?: string) {
  return {
    id,
    to: [],
    subject: "",
    body: "",
    scheduled_time: Date.now() + 10_000,
    total_seconds: 10,
    is_server_queued: true,
    server_queue_id: id,
    optimistic_id: `opt_${id}`,
    thread_token,
  };
}

async function load_module(sends: unknown[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sends));
  vi.resetModules();

  return import("./use_undo_send");
}

describe("restored undo sends after a reload", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.server_sends = [];
    vi.clearAllMocks();
  });

  it("refreshes the thread when a restored reply finishes sending", async () => {
    const mod = await load_module([stored_send("q1", "thread_1")]);

    mod.handle_restored_send_settled("q1", "sent");

    expect(mod.undo_send_manager.get_all()).toHaveLength(0);
    expect(mocks.invalidate_mail_stats).toHaveBeenCalled();
    expect(mocks.emit_email_sent).toHaveBeenCalled();
    expect(mocks.emit_thread_reply_sent).toHaveBeenCalledWith({
      thread_token: "thread_1",
      optimistic_id: "opt_q1",
    });
  });

  it("drops a cancelled restored send without refreshing", async () => {
    const mod = await load_module([stored_send("q1", "thread_1")]);

    mod.handle_restored_send_settled("q1", "cancelled");

    expect(mod.undo_send_manager.get_all()).toHaveLength(0);
    expect(mocks.emit_email_sent).not.toHaveBeenCalled();
    expect(mocks.emit_thread_reply_sent).not.toHaveBeenCalled();
  });

  it("settles restored sends the server no longer holds", async () => {
    mocks.server_sends = [{ queue_id: "q2" }];
    const mod = await load_module([
      stored_send("q1", "thread_1"),
      stored_send("q2", "thread_2"),
    ]);

    mod.settle_restored_sends_missing_from_server();

    expect(mod.undo_send_manager.get_all().map((p) => p.id)).toEqual(["q2"]);
    expect(mocks.emit_thread_reply_sent).toHaveBeenCalledTimes(1);
    expect(mocks.emit_thread_reply_sent).toHaveBeenCalledWith({
      thread_token: "thread_1",
      optimistic_id: "opt_q1",
    });
  });
});
