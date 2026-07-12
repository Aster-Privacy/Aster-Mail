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

import { is_chunk_load_error } from "./chunk_load";

describe("is_chunk_load_error", () => {
  it("matches Safari's module script failure string", () => {
    expect(
      is_chunk_load_error(new Error("Importing a module script failed.")),
    ).toBe(true);
    expect(
      is_chunk_load_error(new Error("Failed to load module script")),
    ).toBe(true);
  });

  it("matches Firefox and Chrome dynamic import failures", () => {
    expect(
      is_chunk_load_error(
        new Error("error loading dynamically imported module"),
      ),
    ).toBe(true);
    expect(
      is_chunk_load_error(
        new Error("Failed to fetch dynamically imported module: /assets/x.js"),
      ),
    ).toBe(true);
    expect(is_chunk_load_error(new Error("Loading chunk 5 failed"))).toBe(true);
    expect(is_chunk_load_error(new Error("ChunkLoadError"))).toBe(true);
  });

  it("accepts plain strings and message-bearing objects", () => {
    expect(is_chunk_load_error("Importing a module script failed.")).toBe(true);
    expect(
      is_chunk_load_error({ message: "Failed to load module script" }),
    ).toBe(true);
  });

  it("ignores unrelated errors and empty input", () => {
    expect(is_chunk_load_error(new Error("Network request failed"))).toBe(
      false,
    );
    expect(is_chunk_load_error(null)).toBe(false);
    expect(is_chunk_load_error(undefined)).toBe(false);
    expect(is_chunk_load_error("")).toBe(false);
  });
});
