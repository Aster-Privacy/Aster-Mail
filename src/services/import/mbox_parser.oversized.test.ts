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
import { describe, it, expect, vi } from "vitest";

vi.mock("./types", async (import_original) => ({
  ...(await import_original<typeof import("./types")>()),
  MAX_SINGLE_EMAIL_SIZE: 1024,
}));

import { iterate_mbox_segments, parse_mbox_file } from "./mbox_parser";

const LIMIT = 1024;
const BIG_BYTES = 12 * 1024 * 1024;

function make_message(n: number, body: string): string {
  return (
    `From sender${n}@example.com Mon Jan 01 00:00:00 2026\n` +
    `From: Sender ${n} <sender${n}@example.com>\n` +
    `Subject: Message ${n}\n` +
    `\n` +
    body +
    `\n`
  );
}

function as_file(text: string): File {
  return new File([new TextEncoder().encode(text)], "test.mbox", {
    type: "application/mbox",
  });
}

async function collect(file: File): Promise<string[]> {
  const segments: string[] = [];

  for await (const segment of iterate_mbox_segments(file)) {
    segments.push(segment);
  }

  return segments;
}

describe("mbox segments larger than the per-email limit", () => {
  it("caps an oversized message that spans read chunks and keeps the rest", async () => {
    const big_body = ("y".repeat(75) + "\n").repeat(BIG_BYTES / 76);
    const file = as_file(
      make_message(1, "first") +
        make_message(2, big_body) +
        make_message(3, "third"),
    );

    const segments = await collect(file);

    expect(segments).toHaveLength(3);
    expect(segments[1].length).toBe(LIMIT + 1);
    expect(segments[2]).toContain("Subject: Message 3");

    const result = await parse_mbox_file(file);

    expect(result.emails.map((e) => e.subject)).toEqual([
      "Message 1",
      "Message 3",
    ]);
    expect(result.warnings).toHaveLength(1);
  });

  it("caps an oversized message made of one long line", async () => {
    const file = as_file(
      make_message(1, "z".repeat(BIG_BYTES)) + make_message(2, "second"),
    );

    const segments = await collect(file);

    expect(segments).toHaveLength(2);
    expect(segments[0].length).toBe(LIMIT + 1);
    expect(segments[1]).toContain("Subject: Message 2");
  });

  it("caps a large file that has no separator", async () => {
    const file = as_file(
      "From: A <a@example.com>\nSubject: Lone\n\n" + "w".repeat(BIG_BYTES),
    );

    const segments = await collect(file);

    expect(segments).toHaveLength(1);
    expect(segments[0].length).toBe(LIMIT + 1);
  });
});
