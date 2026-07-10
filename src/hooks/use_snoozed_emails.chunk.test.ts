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

import { chunk_ids, SNOOZED_IDS_CHUNK_SIZE } from "./use_snoozed_emails";

describe("chunk_ids", () => {
  it("returns no chunks for an empty list", () => {
    expect(chunk_ids([], SNOOZED_IDS_CHUNK_SIZE)).toEqual([]);
  });

  it("keeps a small list in one chunk", () => {
    expect(chunk_ids(["a", "b"], SNOOZED_IDS_CHUNK_SIZE)).toEqual([
      ["a", "b"],
    ]);
  });

  it("splits a large list into chunks of at most the chunk size", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id_${i}`);
    const chunks = chunk_ids(ids, SNOOZED_IDS_CHUNK_SIZE);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
    expect(chunks.flat()).toEqual(ids);
  });

  it("falls back to a single chunk for a non-positive chunk size", () => {
    expect(chunk_ids(["a"], 0)).toEqual([["a"]]);
  });
});
