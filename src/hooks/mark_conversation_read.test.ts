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

const mock_mark_thread_read = vi.fn();
const mock_emit_mail_soft_refresh = vi.fn();

vi.mock("@/services/api/mail", () => ({
  mark_thread_read: (...args: unknown[]) => mock_mark_thread_read(...args),
}));

vi.mock("./email_action_types", () => ({
  emit_mail_soft_refresh: () => mock_emit_mail_soft_refresh(),
}));

import { mark_conversation_read } from "./mark_conversation_read";

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("mark_conversation_read", () => {
  beforeEach(() => {
    mock_mark_thread_read.mockReset();
    mock_emit_mail_soft_refresh.mockReset();
    mock_mark_thread_read.mockResolvedValue({ data: { status: "ok" } });
  });

  it("does nothing without a thread_token", () => {
    mark_conversation_read({
      thread_token: null,
      thread_message_count: 5,
      conversation_grouping: true,
    });

    expect(mock_mark_thread_read).not.toHaveBeenCalled();
  });

  it("does nothing for a single-message thread", () => {
    mark_conversation_read({
      thread_token: "t1",
      thread_message_count: 1,
      grouped_count: 1,
      conversation_grouping: true,
    });

    expect(mock_mark_thread_read).not.toHaveBeenCalled();
  });

  it("clears the whole thread when a grouped conversation is opened", async () => {
    mark_conversation_read({
      thread_token: "t1",
      thread_message_count: 3,
      conversation_grouping: true,
    });

    expect(mock_mark_thread_read).toHaveBeenCalledWith("t1");

    await flush();

    expect(mock_emit_mail_soft_refresh).toHaveBeenCalledTimes(1);
  });

  it("does not clear siblings when grouping is off and only the thread count is high", () => {
    mark_conversation_read({
      thread_token: "t1",
      thread_message_count: 5,
      grouped_count: 1,
      conversation_grouping: false,
    });

    expect(mock_mark_thread_read).not.toHaveBeenCalled();
  });

  it("clears the thread when acting on a grouped row regardless of grouping flag", () => {
    mark_conversation_read({
      thread_token: "t1",
      grouped_count: 4,
      conversation_grouping: false,
    });

    expect(mock_mark_thread_read).toHaveBeenCalledWith("t1");
  });

  it("does not refresh when the thread-read request fails", async () => {
    mock_mark_thread_read.mockResolvedValue({ error: "boom" });

    mark_conversation_read({
      thread_token: "t1",
      thread_message_count: 2,
      conversation_grouping: true,
    });

    await flush();

    expect(mock_mark_thread_read).toHaveBeenCalledWith("t1");
    expect(mock_emit_mail_soft_refresh).not.toHaveBeenCalled();
  });

  it("swallows a rejected thread-read request", async () => {
    mock_mark_thread_read.mockRejectedValue(new Error("network"));

    mark_conversation_read({
      thread_token: "t1",
      thread_message_count: 2,
      conversation_grouping: true,
    });

    await flush();

    expect(mock_emit_mail_soft_refresh).not.toHaveBeenCalled();
  });
});
