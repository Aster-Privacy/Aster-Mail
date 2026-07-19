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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { undo_send_manager } from "./undo_send_manager";
import { undo_send_api } from "./api/undo_send";

vi.mock("./api/undo_send", () => ({
  undo_send_api: {
    queue_email: vi.fn(),
    cancel_email: vi.fn(),
    send_now: vi.fn(),
    get_status: vi.fn(),
    get_pending: vi.fn(),
  },
}));

const mocked_api = vi.mocked(undo_send_api);

describe("undo_send_manager conditional polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocked_api.get_pending.mockResolvedValue({
      data: { emails: [] },
      error: null,
    } as never);
  });

  afterEach(() => {
    undo_send_manager.destroy();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("never polls while idle with no pending sends", async () => {
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocked_api.get_pending).not.toHaveBeenCalled();
  });

  it("starts polling after queue_email and stops when the queue empties", async () => {
    const scheduled = new Date(Date.now() + 30_000);
    const deadline = new Date(Date.now() + 29_000);
    mocked_api.queue_email.mockResolvedValue({
      data: {
        queue_id: "q1",
        scheduled_send_time: scheduled.toISOString(),
        can_cancel_until: deadline.toISOString(),
        delay_seconds: 30,
      },
      error: null,
    } as never);
    mocked_api.get_pending.mockResolvedValue({
      data: {
        emails: [
          {
            queue_id: "q1",
            status: "pending",
            scheduled_send_time: scheduled.toISOString(),
            can_cancel_until: deadline.toISOString(),
            subject_preview: "hi",
          },
        ],
      },
      error: null,
    } as never);

    await undo_send_manager.queue_email({
      to: ["a@astermail.org"],
      cc: [],
      bcc: [],
      subject: "hi",
      body: "b",
      delay_seconds: 30,
    } as never);

    await vi.advanceTimersByTimeAsync(5_100);
    expect(mocked_api.get_pending).toHaveBeenCalledTimes(1);

    mocked_api.get_pending.mockResolvedValue({
      data: { emails: [] },
      error: null,
    } as never);

    await vi.advanceTimersByTimeAsync(5_100);
    expect(mocked_api.get_pending).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocked_api.get_pending).toHaveBeenCalledTimes(2);
  });

  it("sync_with_server resumes polling when the server reports a pending send", async () => {
    const scheduled = new Date(Date.now() + 30_000);
    const deadline = new Date(Date.now() + 29_000);
    mocked_api.get_pending.mockResolvedValue({
      data: {
        emails: [
          {
            queue_id: "q2",
            status: "pending",
            scheduled_send_time: scheduled.toISOString(),
            can_cancel_until: deadline.toISOString(),
            subject_preview: "cross-tab",
          },
        ],
      },
      error: null,
    } as never);

    await undo_send_manager.sync_with_server();
    expect(undo_send_manager.get_pending_sends()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5_100);
    expect(mocked_api.get_pending).toHaveBeenCalledTimes(2);
  });
});
