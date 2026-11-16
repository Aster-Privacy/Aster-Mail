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
import type { CachedIndex, DecryptedIndexEntry } from "./types";
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect } from "vitest";

import { create_body_probe } from "./body_probe";
import { scan_search_index } from "./scan";

function make_item(id: string): MailItem {
  return {
    id,
    item_type: "received",
    folder_token: "inbox",
    is_trashed: false,
    is_spam: false,
    created_at: "2026-01-01T00:00:00Z",
  } as MailItem;
}

function hot_index(pending: CachedIndex["pending_body"]): CachedIndex {
  const items = ["m1", "m2"].map(make_item);

  return {
    items,
    decrypted: new Map(
      items.map((item) => [
        item.id,
        {
          search_body_text: "opening lines only",
          has_body: true,
        } as DecryptedIndexEntry,
      ]),
    ),
    built_at: Date.now(),
    include_body: true,
    user_email: "user@example.com",
    disk_chunk_ids: [],
    total_indexed: 2,
    complete: false,
    meta: null,
    pending_body: pending,
  };
}

const flushed_chunk = {
  written_chunk_ids: () => [0],
  read_body_hits: async (chunk_id: number, words: readonly string[]) => {
    if (chunk_id !== 0) return null;

    return new Map(
      words.map((word) => [
        word,
        new Set("deepword".startsWith(word) ? ["m2"] : []),
      ]),
    );
  },
};

async function found_by_scan(index: CachedIndex): Promise<string[]> {
  const probe = create_body_probe(["deepword"], [])!;
  const found: string[] = [];

  await scan_search_index(
    index,
    (item, entry) => {
      if (probe.matches("deepword", item.id, entry)) found.push(item.id);

      return true;
    },
    () => false,
    { body_probe: probe },
  );

  return found;
}

describe("scan_search_index during the first build", () => {
  it("finds deep body words in chunks flushed before the build finishes", async () => {
    expect(await found_by_scan(hot_index(flushed_chunk))).toEqual(["m2"]);
  });

  it("finds nothing deep once no build is pending", async () => {
    expect(await found_by_scan(hot_index(null))).toEqual([]);
  });
});
