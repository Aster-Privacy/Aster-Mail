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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";

import { afterEach, describe, expect, it } from "vitest";

import {
  assign_message_keys,
  advance_message_keys,
} from "./thread_message_keys";

import {
  clear_iframe_height_cache,
  get_cached_iframe_height,
  set_cached_iframe_height,
} from "@/components/email/sandboxed_email_renderer/helpers";

function message(
  id: string,
  timestamp: string,
  overrides: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: "Subject",
    body: "Body",
    timestamp,
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: false,
    ...overrides,
  };
}

const received = message("received_1", "2026-11-05T10:00:00.000Z");
const optimistic = message("local_1", "2026-11-05T10:05:00.000Z", {
  item_type: "sent",
  is_sending: true,
});
const sent_copy = message("server_1", "2026-11-05T10:05:01.000Z", {
  item_type: "sent",
});
const empty = { messages: [], keys: new Map<string, string>() };

afterEach(() => {
  clear_iframe_height_cache();
});

describe("assign_message_keys", () => {
  it("keys every message by its own id by default", () => {
    const result = assign_message_keys(empty, [received, optimistic]);

    expect(result.keys.get("received_1")).toBe("received_1");
    expect(result.keys.get("local_1")).toBe("local_1");
    expect(result.adopted).toEqual([]);
  });

  it("gives the server copy the key of the local reply it replaces", () => {
    const first = assign_message_keys(empty, [received, optimistic]);
    const second = assign_message_keys(first, [received, sent_copy]);

    expect(second.keys.get("server_1")).toBe("local_1");
    expect(second.keys.get("received_1")).toBe("received_1");
    expect(second.adopted).toEqual([{ from_id: "local_1", to_id: "server_1" }]);
  });

  it("keeps the adopted key on later updates", () => {
    const first = assign_message_keys(empty, [received, optimistic]);
    const second = assign_message_keys(first, [received, sent_copy]);
    const third = assign_message_keys(second, [
      received,
      { ...sent_copy, is_read: false },
    ]);

    expect(third.keys.get("server_1")).toBe("local_1");
    expect(third.adopted).toEqual([]);
  });

  it("treats a reply waiting on the server as local", () => {
    const waiting = {
      ...optimistic,
      is_sending: false,
      send_status: "pending_server",
    };
    const first = assign_message_keys(empty, [received, waiting]);
    const second = assign_message_keys(first, [received, sent_copy]);

    expect(second.keys.get("server_1")).toBe("local_1");
  });

  it("pairs several replies in send order", () => {
    const optimistic_2 = message("local_2", "2026-11-05T10:06:00.000Z", {
      item_type: "sent",
      is_sending: true,
    });
    const sent_copy_2 = message("server_2", "2026-11-05T10:06:01.000Z", {
      item_type: "sent",
    });
    const first = assign_message_keys(empty, [
      received,
      optimistic,
      optimistic_2,
    ]);
    const second = assign_message_keys(first, [
      received,
      sent_copy_2,
      sent_copy,
    ]);

    expect(second.keys.get("server_1")).toBe("local_1");
    expect(second.keys.get("server_2")).toBe("local_2");
  });

  it("leaves new received mail and unmatched sent mail alone", () => {
    const reply_in = message("received_2", "2026-11-05T10:07:00.000Z");
    const first = assign_message_keys(empty, [received]);
    const second = assign_message_keys(first, [received, sent_copy, reply_in]);

    expect(second.keys.get("server_1")).toBe("server_1");
    expect(second.keys.get("received_2")).toBe("received_2");
    expect(second.adopted).toEqual([]);
  });

  it("does not adopt a received message for a cancelled reply", () => {
    const reply_in = message("received_2", "2026-11-05T10:07:00.000Z");
    const first = assign_message_keys(empty, [received, optimistic]);
    const second = assign_message_keys(first, [received, reply_in]);

    expect(second.keys.get("received_2")).toBe("received_2");
    expect(second.adopted).toEqual([]);
  });
});

describe("advance_message_keys", () => {
  it("returns the same state when the list is unchanged", () => {
    const list = [received, optimistic];
    const state = advance_message_keys(empty, list);

    expect(advance_message_keys(state, list)).toBe(state);
  });

  it("carries the measured body height to the server copy", () => {
    const first = advance_message_keys(empty, [received, optimistic]);

    set_cached_iframe_height("local_1", 240);
    const second = advance_message_keys(first, [received, sent_copy]);

    expect(second.keys.get("server_1")).toBe("local_1");
    expect(get_cached_iframe_height("server_1")).toBe(240);
  });

  it("keeps a height already measured for the server copy", () => {
    const first = advance_message_keys(empty, [received, optimistic]);

    set_cached_iframe_height("local_1", 240);
    set_cached_iframe_height("server_1", 300);
    advance_message_keys(first, [received, sent_copy]);

    expect(get_cached_iframe_height("server_1")).toBe(300);
  });
});
