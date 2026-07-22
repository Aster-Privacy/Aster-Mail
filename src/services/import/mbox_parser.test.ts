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
import { describe, expect, it } from "vitest";

import { parse_mbox_file } from "./mbox_parser";

function make_mbox_file(content: string, name = "test.mbox"): File {
  return new File([content], name, { type: "application/mbox" });
}

function build_message(from: string, subject: string, body: string): string {
  return `From ${from} Mon Jan  1 00:00:00 2026\r\nFrom: ${from}\r\nTo: someone@example.com\r\nSubject: ${subject}\r\nDate: Mon, 1 Jan 2026 00:00:00 +0000\r\n\r\n${body}\r\n`;
}

describe("parse_mbox_file", () => {
  it("parses multiple messages separated by From lines", async () => {
    const content =
      build_message("alice@example.com", "First", "Hello one") +
      build_message("bob@example.com", "Second", "Hello two") +
      build_message("carol@example.com", "Third", "Hello three");

    const result = await parse_mbox_file(make_mbox_file(content));

    expect(result.errors).toEqual([]);
    expect(result.emails).toHaveLength(3);
    expect(result.emails.map((e) => e.subject)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("falls back to a single message when no From separator exists", async () => {
    const content =
      "From: solo@example.com\r\nTo: someone@example.com\r\nSubject: Solo\r\nDate: Mon, 1 Jan 2026 00:00:00 +0000\r\n\r\nJust one message\r\n";

    const result = await parse_mbox_file(make_mbox_file(content));

    expect(result.errors).toEqual([]);
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe("Solo");
  });

  it("reports no_emails_in_mbox for content with no recognizable message", async () => {
    const result = await parse_mbox_file(make_mbox_file("just some random text\r\nwith no headers\r\n"));

    expect(result.emails).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("correctly parses messages whose separators fall across internal chunk boundaries", async () => {
    const padding_body = "x".repeat(1024 * 1024);
    const messages: string[] = [];

    for (let i = 0; i < 20; i++) {
      messages.push(build_message(`user${i}@example.com`, `Subject ${i}`, padding_body));
    }

    const content = messages.join("");

    expect(content.length).toBeGreaterThan(16 * 1024 * 1024);

    const result = await parse_mbox_file(make_mbox_file(content));

    expect(result.errors).toEqual([]);
    expect(result.emails).toHaveLength(20);
    expect(result.emails.map((e) => e.subject)).toEqual(
      Array.from({ length: 20 }, (_, i) => `Subject ${i}`),
    );
  });

  it("reports file_too_large when exceeding the configured cap", async () => {
    const original_size = File.prototype.constructor;
    void original_size;

    const huge = make_mbox_file("From a@b.com\r\n\r\nbody\r\n");
    Object.defineProperty(huge, "size", { value: 5 * 1024 * 1024 * 1024 });

    const result = await parse_mbox_file(huge);

    expect(result.emails).toEqual([]);
    expect(result.errors.length).toBe(1);
  });
});
