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
import { describe, it, expect } from "vitest";

import { parse_mbox_file } from "./mbox_parser";

function make_message(n: number, body_pad = 0): string {
  return (
    `From sender${n}@example.com Mon Jan 01 00:00:00 2026\n` +
    `From: Sender ${n} <sender${n}@example.com>\n` +
    `To: user@example.com\n` +
    `Subject: Message ${n}\n` +
    `Message-ID: <msg${n}@example.com>\n` +
    `Date: Mon, 01 Jan 2026 00:00:0${n % 10} +0000\n` +
    `\n` +
    `body of message ${n}\n` +
    "x".repeat(body_pad) +
    `\n`
  );
}

function as_file(text: string): File {
  return new File([new TextEncoder().encode(text)], "test.mbox", {
    type: "application/mbox",
  });
}

describe("parse_mbox_file streaming", () => {
  it("parses every message in a small mbox", async () => {
    const text = [1, 2, 3].map((n) => make_message(n)).join("");
    const result = await parse_mbox_file(as_file(text));

    expect(result.errors).toEqual([]);
    expect(result.emails).toHaveLength(3);
    expect(result.emails.map((e) => e.subject)).toEqual([
      "Message 1",
      "Message 2",
      "Message 3",
    ]);
  });

  it("parses messages that straddle the 8 MB read boundary", async () => {
    const big = make_message(1, 9 * 1024 * 1024);
    const text = big + make_message(2) + make_message(3);
    const result = await parse_mbox_file(as_file(text));

    expect(result.errors).toEqual([]);
    expect(result.emails).toHaveLength(3);
    expect(result.emails.map((e) => e.subject)).toEqual([
      "Message 1",
      "Message 2",
      "Message 3",
    ]);
    expect(result.emails[0].text_body).toContain("body of message 1");
  });

  it("unescapes quoted From lines in bodies", async () => {
    const text =
      `From sender@example.com Mon Jan 01 00:00:00 2026\n` +
      `From: A <a@example.com>\n` +
      `Subject: Quoted\n` +
      `\n` +
      `>From the desk of A\n`;
    const result = await parse_mbox_file(as_file(text));

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].text_body).toContain("From the desk of A");
  });

  it("falls back to a single message when there is no From separator", async () => {
    const text = `From: A <a@example.com>\nSubject: Lone\n\njust one message\n`;
    const result = await parse_mbox_file(as_file(text));

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe("Lone");
  });

  it("reports no emails for content that is not an mbox", async () => {
    const result = await parse_mbox_file(as_file("nothing useful here\n"));

    expect(result.emails).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("reports monotonic progress that ends at 100 percent", async () => {
    const text = Array.from({ length: 40 }, (_, i) =>
      make_message(i + 1, 400 * 1024),
    ).join("");
    const seen: number[] = [];

    const result = await parse_mbox_file(as_file(text), (p) => {
      seen.push(p.percentage);
    });

    expect(result.emails).toHaveLength(40);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(100);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });
});
