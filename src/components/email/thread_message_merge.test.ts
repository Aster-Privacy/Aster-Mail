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
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, expect, it } from "vitest";

import {
  has_readable_body,
  include_opened_message,
  keep_readable_bodies,
} from "./thread_message_merge";

import { RATCHET_UNDECRYPTABLE_SENTINEL } from "@/utils/email_crypto";

function message(
  id: string,
  timestamp: string,
  body: string,
  html_content?: string,
): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: "Subject",
    body,
    html_content,
    timestamp,
    is_read: false,
    is_starred: false,
    is_deleted: false,
    is_external: true,
  } as DecryptedThreadMessage;
}

describe("has_readable_body", () => {
  it("rejects empty, whitespace, and undecryptable bodies", () => {
    expect(has_readable_body(message("a", "2026-10-01", ""))).toBe(false);
    expect(has_readable_body(message("a", "2026-10-01", "  \n"))).toBe(false);
    expect(
      has_readable_body(
        message("a", "2026-10-01", RATCHET_UNDECRYPTABLE_SENTINEL),
      ),
    ).toBe(false);
  });

  it("accepts text or html content", () => {
    expect(has_readable_body(message("a", "2026-10-01", "Hello"))).toBe(true);
    expect(
      has_readable_body(message("a", "2026-10-01", "", "<p>Hello</p>")),
    ).toBe(true);
  });
});

describe("include_opened_message", () => {
  const older = message("old", "2026-10-01T08:00:00Z", "Earlier");
  const opened = message("new", "2026-10-02T08:00:00Z", "New mail");

  it("adds the opened message when the thread list predates it", () => {
    const result = include_opened_message([older], opened);

    expect(result.map((m) => m.id)).toEqual(["old", "new"]);
  });

  it("falls back to the opened message when the thread is empty", () => {
    expect(include_opened_message([], opened)).toEqual([opened]);
  });

  it("fills an empty thread copy with the opened message body", () => {
    const blank_copy = message("new", "2026-10-02T08:00:00Z", "");
    const result = include_opened_message([older, blank_copy], opened);

    expect(result[1].body).toBe("New mail");
  });

  it("keeps a readable thread copy as is", () => {
    const list = [older, message("new", "2026-10-02T08:00:00Z", "Server")];

    expect(include_opened_message(list, opened)).toBe(list);
  });
});

describe("keep_readable_bodies", () => {
  it("keeps the earlier body when a refresh returns an empty one", () => {
    const previous = [message("a", "2026-10-01", "Body", "<p>Body</p>")];
    const incoming = [message("a", "2026-10-01", "")];
    const result = keep_readable_bodies(previous, incoming);

    expect(result[0].body).toBe("Body");
    expect(result[0].html_content).toBe("<p>Body</p>");
  });

  it("takes the refreshed body when it is readable", () => {
    const incoming = [message("a", "2026-10-01", "Updated")];

    expect(
      keep_readable_bodies([message("a", "2026-10-01", "Body")], incoming),
    ).toBe(incoming);
  });
});
