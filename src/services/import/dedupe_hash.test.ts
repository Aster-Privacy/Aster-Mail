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

import { compute_import_dedupe_hash } from "./dedupe_hash";
import { compute_message_id_hash } from "./parser";

async function unkeyed_digest(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );

  return btoa(String.fromCharCode(...digest));
}

describe("import dedupe hash", () => {
  it("is stable for one account so a repeated import is detected", async () => {
    const first = await compute_import_dedupe_hash("key-a", "message_id", "x");
    const second = await compute_import_dedupe_hash("key-a", "message_id", "x");

    expect(first).toBe(second);
    expect(atob(first).length).toBe(32);
  });

  it("differs between accounts for the same message", async () => {
    const mine = await compute_import_dedupe_hash("key-a", "message_id", "x");
    const theirs = await compute_import_dedupe_hash("key-b", "message_id", "x");

    expect(mine).not.toBe(theirs);
  });

  it("never equals the unkeyed digest of the message identifier", async () => {
    const keyed = await compute_message_id_hash("<a@example.com>", "key-a");

    expect(keyed).not.toBe(await unkeyed_digest("<a@example.com>"));
  });

  it("separates message identifiers from message content", async () => {
    const as_id = await compute_import_dedupe_hash("key-a", "message_id", "x");
    const as_content = await compute_import_dedupe_hash(
      "key-a",
      "content",
      "x",
    );

    expect(as_id).not.toBe(as_content);
  });

  it("refuses to hash without an account key", async () => {
    await expect(
      compute_import_dedupe_hash("", "message_id", "x"),
    ).rejects.toThrow();
  });
});
