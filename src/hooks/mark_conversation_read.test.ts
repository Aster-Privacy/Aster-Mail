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

const mock_mark_thread_read = vi.fn();
const mock_emit_mail_soft_refresh = vi.fn();
const mock_thread_has_unread_entries = vi.fn((..._args: unknown[]) => false);
const mock_mark_thread_read_entries = vi.fn((..._args: unknown[]) => {});
const mock_invalidate_mail_stats = vi.fn();

vi.mock("@/services/api/mail", () => ({
  mark_thread_read: (...args: unknown[]) => mock_mark_thread_read(...args),
}));

vi.mock("./email_action_types", () => ({
  emit_mail_soft_refresh: () => mock_emit_mail_soft_refresh(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: () => mock_invalidate_mail_stats(),
}));

vi.mock("@/services/category_index", () => ({
  get_thread_entry_ids: () => [],
  mark_thread_read_entries: (...args: unknown[]) =>
    mock_mark_thread_read_entries(...args),
  thread_has_unread_entries: (...args: unknown[]) =>
    mock_thread_has_unread_entries(...args),
}));

import {
  collect_conversation_thread_tokens,
  mark_conversation_read,
  mark_conversation_threads_read,
} from "./mark_conversation_read";

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("mark_conversation_read", () => {
  beforeEach(() => {
    mock_mark_thread_read.mockReset();
    mock_emit_mail_soft_refresh.mockReset();
    mock_mark_thread_read_entries.mockReset();
    mock_thread_has_unread_entries.mockReset();
    mock_thread_has_unread_entries.mockReturnValue(false);
    mock_mark_thread_read.mockResolvedValue({ data: { status: "ok" } });
    mock_invalidate_mail_stats.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("clears a category-tab row whose indexed thread still has unread siblings", async () => {
    mock_thread_has_unread_entries.mockReturnValue(true);

    mark_conversation_read({
      thread_token: "t1",
      thread_message_count: 1,
      grouped_count: 1,
      conversation_grouping: true,
      acted_id: "m1",
    });

    expect(mock_thread_has_unread_entries).toHaveBeenCalledWith("t1", "m1");
    expect(mock_mark_thread_read).toHaveBeenCalledWith("t1");

    await flush();

    expect(mock_mark_thread_read_entries).toHaveBeenCalledWith("t1");
  });

  it("never clears indexed siblings when grouping is off", () => {
    mock_thread_has_unread_entries.mockReturnValue(true);

    mark_conversation_read({
      thread_token: "t1",
      thread_message_count: 1,
      grouped_count: 1,
      conversation_grouping: false,
      acted_id: "m1",
    });

    expect(mock_mark_thread_read).not.toHaveBeenCalled();
  });

  it("does not fire for a lone message whose only unread index entry is itself", () => {
    mock_thread_has_unread_entries.mockReturnValue(false);

    mark_conversation_read({
      thread_token: "t1",
      thread_message_count: 1,
      grouped_count: 1,
      conversation_grouping: true,
      acted_id: "m1",
    });

    expect(mock_mark_thread_read).not.toHaveBeenCalled();
  });
});

describe("collect_conversation_thread_tokens", () => {
  beforeEach(() => {
    mock_thread_has_unread_entries.mockReset();
    mock_thread_has_unread_entries.mockReturnValue(false);
  });

  it("includes a server-collapsed row whose thread has more than one message", () => {
    const tokens = collect_conversation_thread_tokens(
      [
        {
          id: "m1",
          item_type: "received",
          thread_token: "t1",
          thread_message_count: 4,
          grouped_email_ids: ["m1"],
        },
      ],
      true,
    );

    expect(tokens).toEqual(["t1"]);
  });

  it("skips single-message threads and non-received rows", () => {
    const tokens = collect_conversation_thread_tokens(
      [
        {
          id: "m1",
          item_type: "received",
          thread_token: "t1",
          thread_message_count: 1,
          grouped_email_ids: ["m1"],
        },
        {
          id: "m2",
          item_type: "sent",
          thread_token: "t2",
          thread_message_count: 5,
        },
      ],
      true,
    );

    expect(tokens).toEqual([]);
  });

  it("dedupes tokens and ignores thread size when grouping is off", () => {
    const tokens = collect_conversation_thread_tokens(
      [
        {
          id: "m1",
          item_type: "received",
          thread_token: "t1",
          thread_message_count: 4,
        },
        {
          id: "m2",
          item_type: "received",
          thread_token: "t1",
          thread_message_count: 4,
        },
      ],
      false,
    );

    expect(tokens).toEqual([]);
  });
});

describe("mark_conversation_threads_read", () => {
  beforeEach(() => {
    mock_mark_thread_read.mockReset();
    mock_mark_thread_read_entries.mockReset();
    mock_emit_mail_soft_refresh.mockReset();
    mock_invalidate_mail_stats.mockReset();
    mock_mark_thread_read.mockResolvedValue({ data: { status: "ok" } });
  });

  it("marks every thread read then refreshes the stats badge", async () => {
    await mark_conversation_threads_read(["t1", "t2"]);

    expect(mock_mark_thread_read).toHaveBeenCalledWith("t1");
    expect(mock_mark_thread_read).toHaveBeenCalledWith("t2");
    expect(mock_mark_thread_read_entries).toHaveBeenCalledTimes(2);
    expect(mock_emit_mail_soft_refresh).toHaveBeenCalledTimes(1);
    expect(mock_invalidate_mail_stats).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an empty token list", async () => {
    await mark_conversation_threads_read([]);

    expect(mock_mark_thread_read).not.toHaveBeenCalled();
    expect(mock_invalidate_mail_stats).not.toHaveBeenCalled();
  });
});
