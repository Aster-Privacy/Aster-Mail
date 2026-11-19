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
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, expect, it } from "vitest";

import {
  include_opened_message,
  keep_readable_bodies,
} from "./thread_message_merge";

import { RATCHET_UNDECRYPTABLE_SENTINEL } from "@/utils/email_crypto";

function message(
  id: string,
  timestamp: string,
  body: string,
): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.test",
    subject: "Subject",
    body,
    timestamp,
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: false,
  } as DecryptedThreadMessage;
}

const sealed_sent_at = "2026-11-17T09:00:00.000Z";
const outer_created_at = "2026-11-17T11:00:00.000Z";
const middle_at = "2026-11-17T10:00:00.000Z";
const later_at = "2026-11-17T12:00:00.000Z";

function ids(list: DecryptedThreadMessage[]): string[] {
  return list.map((m) => m.id);
}

describe("thread merge order", () => {
  it("re-sorts after a failed refresh takes the earlier timestamp", () => {
    const previous = [
      message("a", sealed_sent_at, "readable a"),
      message("b", middle_at, "readable b"),
      message("c", later_at, "readable c"),
    ];
    const incoming = [
      message("b", middle_at, "readable b"),
      message("a", outer_created_at, RATCHET_UNDECRYPTABLE_SENTINEL),
      message("c", later_at, "readable c"),
    ];

    const merged = keep_readable_bodies(previous, incoming);

    expect(merged.find((m) => m.id === "a")?.timestamp).toBe(sealed_sent_at);
    expect(ids(merged)).toEqual(["a", "b", "c"]);
  });

  it("re-sorts after the opened copy replaces a thread copy", () => {
    const thread = [
      message("b", middle_at, "readable b"),
      message("a", outer_created_at, RATCHET_UNDECRYPTABLE_SENTINEL),
      message("c", later_at, "readable c"),
    ];
    const opened = message("a", sealed_sent_at, "readable a");

    const merged = include_opened_message(thread, opened);

    expect(merged.find((m) => m.id === "a")?.timestamp).toBe(sealed_sent_at);
    expect(ids(merged)).toEqual(["a", "b", "c"]);
  });

  it("keeps the incoming order for equal timestamps", () => {
    const previous = [
      message("x", middle_at, "readable x"),
      message("y", middle_at, "readable y"),
    ];
    const incoming = [
      message("y", middle_at, RATCHET_UNDECRYPTABLE_SENTINEL),
      message("x", middle_at, "readable x"),
    ];

    expect(ids(keep_readable_bodies(previous, incoming))).toEqual(["y", "x"]);
  });

  it("returns the incoming list unchanged when nothing is merged", () => {
    const incoming = [
      message("b", later_at, "readable b"),
      message("a", middle_at, "readable a"),
    ];

    expect(keep_readable_bodies(incoming, incoming)).toBe(incoming);
    expect(
      include_opened_message(incoming, message("a", middle_at, "readable a")),
    ).toBe(incoming);
  });
});
