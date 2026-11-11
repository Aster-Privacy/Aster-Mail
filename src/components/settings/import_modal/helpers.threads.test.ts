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
import type { ParsedEmail } from "@/services/import/parser";

import { describe, expect, it } from "vitest";

import {
  build_thread_map,
  header_message_ids,
  message_id_key,
} from "./helpers";

function email(
  message_id: string,
  subject: string,
  headers: Record<string, string> = {},
): ParsedEmail {
  return {
    message_id,
    from: "a@example.com",
    to: [],
    cc: [],
    bcc: [],
    subject,
    date: new Date(0),
    html_body: null,
    text_body: "t",
    attachments: [],
    raw_headers: headers,
  } as ParsedEmail;
}

describe("header_message_ids", () => {
  it("reads bracketed ids and ignores trailing comments", () => {
    expect(
      header_message_ids("<a@example.com> (Bob's message of Monday)"),
    ).toEqual(["a@example.com"]);
    expect(header_message_ids("<a@x.com>\r\n <b@x.com>")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("reads bare ids and skips empty headers", () => {
    expect(header_message_ids("a@x.com")).toEqual(["a@x.com"]);
    expect(header_message_ids(undefined)).toEqual([]);
    expect(header_message_ids("")).toEqual([]);
  });

  it("keys ids without brackets or case", () => {
    expect(message_id_key("<ABC@Example.com>")).toBe("abc@example.com");
  });
});

describe("build_thread_map", () => {
  it("links replies whose in-reply-to carries a comment or other case", async () => {
    const map = await build_thread_map([
      email("root@x.com", "Plans"),
      email("reply@x.com", "Re: Different words", {
        "in-reply-to": "<ROOT@x.com> (message from Bob)",
      }),
    ]);

    expect(map.get("root@x.com")).toBeDefined();
    expect(map.get("reply@x.com")).toBe(map.get("root@x.com"));
  });

  it("links a reply to an earlier reference when the parent is missing", async () => {
    const map = await build_thread_map([
      email("root@x.com", "Plans"),
      email("third@x.com", "Re: Plans", {
        "in-reply-to": "<missing@x.com>",
        references: "<root@x.com> <missing@x.com>",
      }),
    ]);

    expect(map.get("third@x.com")).toBe(map.get("root@x.com"));
  });

  it("keeps unrelated messages apart", async () => {
    const map = await build_thread_map([
      email("one@x.com", "Invoice 1"),
      email("two@x.com", "Invoice 2"),
    ]);

    expect(map.size).toBe(0);
  });
});
