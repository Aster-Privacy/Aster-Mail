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

import { describe, it, expect } from "vitest";

import { build_thread_print_data } from "./thread_print_data";

function make_message(
  id: string,
  overrides: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: `Sender ${id}`,
    sender_email: `${id}@example.com`,
    subject: "Plans",
    body: `Body ${id}`,
    timestamp: "2026-01-02T03:04:05Z",
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: false,
    ...overrides,
  } as DecryptedThreadMessage;
}

describe("build_thread_print_data", () => {
  it("returns null for an empty conversation", () => {
    expect(build_thread_print_data("Plans", [])).toBeNull();
  });

  it("includes every message in order", () => {
    const data = build_thread_print_data("Plans", [
      make_message("a"),
      make_message("b", { html_content: "<p>Rich b</p>" }),
    ]);

    expect(data?.subject).toBe("Plans");
    expect(data?.messages.map((m) => m.sender_email)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(data?.messages[0].body).toBe("Body a");
    expect(data?.messages[1].body).toBe("<p>Rich b</p>");
  });

  it("prefers the display sender over the raw sender", () => {
    const data = build_thread_print_data("Plans", [
      make_message("a", {
        display_sender_name: "Alias Name",
        display_sender_email: "alias@example.com",
      }),
    ]);

    expect(data?.messages[0].sender).toBe("Alias Name");
    expect(data?.messages[0].sender_email).toBe("alias@example.com");
  });
});
