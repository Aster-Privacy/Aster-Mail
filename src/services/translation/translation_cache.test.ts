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
import { beforeEach, describe, expect, it } from "vitest";

import {
  clear_translation_cache,
  MAX_CACHE_BYTES,
  MAX_CACHE_ENTRIES,
  read_translation,
  translation_cache_stats,
  write_translation,
} from "./translation_cache";

function key(message_id: string) {
  return {
    account_id: "acct-1",
    message_id,
    source: "de" as const,
    target: "en" as const,
    model_version: "v1",
  };
}

beforeEach(() => {
  clear_translation_cache();
});

describe("translation_cache", () => {
  it("round trips segments", () => {
    write_translation(key("m1"), ["one", "two"]);

    expect(read_translation(key("m1"))).toEqual(["one", "two"]);
  });

  it("misses on a different target language", () => {
    write_translation(key("m1"), ["one"]);

    expect(
      read_translation({
        account_id: "acct-1",
        message_id: "m1",
        source: "de",
        target: "de",
        model_version: "v1",
      }),
    ).toBeNull();
  });

  it("misses on a different source language", () => {
    write_translation(key("m1"), ["one"]);

    expect(
      read_translation({
        account_id: "acct-1",
        message_id: "m1",
        source: "fr",
        target: "en",
        model_version: "v1",
      }),
    ).toBeNull();
  });

  it("misses on a different model version", () => {
    write_translation(key("m1"), ["one"]);

    expect(
      read_translation({
        account_id: "acct-1",
        message_id: "m1",
        source: "de",
        target: "en",
        model_version: "v2",
      }),
    ).toBeNull();
  });

  it("misses on a different account", () => {
    write_translation(key("m1"), ["one"]);

    expect(
      read_translation({
        account_id: "acct-2",
        message_id: "m1",
        source: "de",
        target: "en",
        model_version: "v1",
      }),
    ).toBeNull();
  });

  it("returns a copy the caller cannot mutate into the cache", () => {
    write_translation(key("m1"), ["one"]);

    const first = read_translation(key("m1"));

    first?.push("injected");

    expect(read_translation(key("m1"))).toEqual(["one"]);
  });

  it("evicts the least recently used entry at the entry cap", () => {
    for (let index = 0; index < MAX_CACHE_ENTRIES; index += 1) {
      write_translation(key(`m${index}`), ["x"]);
    }

    read_translation(key("m0"));
    write_translation(key("overflow"), ["x"]);

    expect(translation_cache_stats().entries).toBe(MAX_CACHE_ENTRIES);
    expect(read_translation(key("m0"))).toEqual(["x"]);
    expect(read_translation(key("m1"))).toBeNull();
  });

  it("evicts at the byte cap", () => {
    const chunk = "x".repeat(1024 * 1024);

    for (let index = 0; index < 30; index += 1) {
      write_translation(key(`big${index}`), [chunk, chunk]);
    }

    expect(translation_cache_stats().bytes).toBeLessThanOrEqual(MAX_CACHE_BYTES);
    expect(translation_cache_stats().entries).toBeLessThan(30);
  });

  it("refuses an entry larger than the whole cache", () => {
    write_translation(key("huge"), ["x".repeat(MAX_CACHE_BYTES)]);

    expect(read_translation(key("huge"))).toBeNull();
    expect(translation_cache_stats().entries).toBe(0);
  });

  it("clears everything on purge", () => {
    write_translation(key("m1"), ["one"]);
    clear_translation_cache();

    expect(translation_cache_stats()).toEqual({ entries: 0, bytes: 0 });
    expect(read_translation(key("m1"))).toBeNull();
  });
});
