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

const mock_thread_has_unread_entries = vi.fn((..._args: unknown[]) => false);

vi.mock("@/services/api/mail", () => ({
  mark_thread_read: vi.fn(),
}));

vi.mock("./email_action_types", () => ({
  emit_mail_soft_refresh: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  mark_thread_read_entries: vi.fn(),
  thread_has_unread_entries: (...args: unknown[]) =>
    mock_thread_has_unread_entries(...args),
}));

import {
  conversation_has_unread_sibling,
  conversation_read_delta,
  read_clears_conversation,
} from "./unread_read_delta";

describe("read_clears_conversation", () => {
  beforeEach(() => {
    mock_thread_has_unread_entries.mockReset();
    mock_thread_has_unread_entries.mockReturnValue(false);
  });

  it("clears when the message has no thread", () => {
    expect(
      read_clears_conversation({
        thread_token: null,
        acted_id: "a",
        conversation_grouping: true,
      }),
    ).toBe(true);
  });

  it("clears when no indexed sibling is still unread", () => {
    mock_thread_has_unread_entries.mockReturnValue(false);

    expect(
      read_clears_conversation({
        thread_token: "t1",
        acted_id: "a",
        thread_message_count: 3,
        conversation_grouping: true,
      }),
    ).toBe(true);
  });

  it("clears when unread siblings remain but the whole thread is marked read", () => {
    mock_thread_has_unread_entries.mockReturnValue(true);

    expect(
      read_clears_conversation({
        thread_token: "t1",
        acted_id: "a",
        thread_message_count: 3,
        conversation_grouping: true,
      }),
    ).toBe(true);
  });

  it("does not clear when grouping is off and unread siblings remain", () => {
    mock_thread_has_unread_entries.mockReturnValue(true);

    expect(
      read_clears_conversation({
        thread_token: "t1",
        acted_id: "a",
        thread_message_count: 3,
        conversation_grouping: false,
      }),
    ).toBe(false);
  });

  it("clears a grouped row the user acted on even with grouping off", () => {
    mock_thread_has_unread_entries.mockReturnValue(true);

    expect(
      read_clears_conversation({
        thread_token: "t1",
        acted_id: "a",
        grouped_count: 4,
        conversation_grouping: false,
      }),
    ).toBe(true);
  });

  it("excludes the acted message when probing indexed siblings", () => {
    read_clears_conversation({
      thread_token: "t1",
      acted_id: "acted",
      conversation_grouping: true,
    });

    expect(mock_thread_has_unread_entries).toHaveBeenCalledWith(
      "t1",
      "acted",
    );
  });
});

describe("conversation_has_unread_sibling", () => {
  beforeEach(() => {
    mock_thread_has_unread_entries.mockReset();
    mock_thread_has_unread_entries.mockReturnValue(false);
  });

  it("trusts a caller-supplied sibling without probing the index", () => {
    expect(
      conversation_has_unread_sibling({
        thread_token: "t1",
        acted_id: "a",
        sibling_unread: true,
      }),
    ).toBe(true);
    expect(mock_thread_has_unread_entries).not.toHaveBeenCalled();
  });

  it("reports no sibling for a message without a thread", () => {
    expect(
      conversation_has_unread_sibling({ thread_token: null, acted_id: "a" }),
    ).toBe(false);
  });

  it("falls back to the index when the caller knows of no sibling", () => {
    mock_thread_has_unread_entries.mockReturnValue(true);

    expect(
      conversation_has_unread_sibling({ thread_token: "t1", acted_id: "a" }),
    ).toBe(true);
  });
});

describe("conversation_read_delta", () => {
  beforeEach(() => {
    mock_thread_has_unread_entries.mockReset();
    mock_thread_has_unread_entries.mockReturnValue(false);
  });

  it("counts one selected conversation once when marking read", () => {
    expect(
      conversation_read_delta(
        [
          {
            id: "a",
            item_type: "received",
            is_read: false,
            thread_token: "t1",
          },
          {
            id: "b",
            item_type: "received",
            is_read: false,
            thread_token: "t1",
          },
        ],
        true,
      ),
    ).toBe(-1);
  });

  it("counts one selected conversation once when marking unread", () => {
    expect(
      conversation_read_delta(
        [
          { id: "a", item_type: "received", is_read: true, thread_token: "t1" },
          { id: "b", item_type: "received", is_read: true, thread_token: "t1" },
        ],
        false,
      ),
    ).toBe(1);
  });

  it("keeps a conversation unread when grouping is off and an unselected sibling stays unread", () => {
    mock_thread_has_unread_entries.mockReturnValue(true);

    expect(
      conversation_read_delta(
        [
          {
            id: "a",
            item_type: "received",
            is_read: false,
            thread_token: "t1",
          },
        ],
        true,
        false,
      ),
    ).toBe(0);
  });

  it("clears a conversation whose remaining siblings are marked read with it", () => {
    mock_thread_has_unread_entries.mockReturnValue(true);

    expect(
      conversation_read_delta(
        [
          {
            id: "a",
            item_type: "received",
            is_read: false,
            thread_token: "t1",
          },
        ],
        true,
        true,
      ),
    ).toBe(-1);
  });

  it("counts distinct threads separately", () => {
    expect(
      conversation_read_delta(
        [
          {
            id: "a",
            item_type: "received",
            is_read: false,
            thread_token: "t1",
          },
          {
            id: "b",
            item_type: "received",
            is_read: false,
            thread_token: "t2",
          },
        ],
        true,
      ),
    ).toBe(-2);
  });

  it("ignores rows that are not received mail", () => {
    expect(
      conversation_read_delta(
        [{ id: "a", item_type: "sent", is_read: false, thread_token: "t1" }],
        true,
      ),
    ).toBe(0);
  });

  it("does not double count a conversation that is already read", () => {
    expect(
      conversation_read_delta(
        [
          { id: "a", item_type: "received", is_read: true, thread_token: "t1" },
          { id: "b", item_type: "received", is_read: true, thread_token: "t1" },
        ],
        true,
      ),
    ).toBe(0);
  });
});
