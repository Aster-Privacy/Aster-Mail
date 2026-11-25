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
import { afterEach, describe, expect, it, vi } from "vitest";

import { read_file_bytes } from "./read_file_bytes";

function bytes_of(buffer: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buffer));
}

describe("read_file_bytes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads a file with a non ascii name", async () => {
    const file = new File(
      [new Uint8Array([37, 80, 68, 70])],
      "Vente bâti hors copropriété.pdf",
      {
        type: "application/pdf",
      },
    );

    expect(bytes_of(await read_file_bytes(file))).toEqual([37, 80, 68, 70]);
  });

  it("falls back when arrayBuffer rejects", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", {
      type: "image/png",
    });

    vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new DOMException("denied", "NotReadableError"),
    );

    expect(bytes_of(await read_file_bytes(file))).toEqual([1, 2, 3]);
  });

  it("falls back to FileReader when the other readers fail", async () => {
    const file = new File([new Uint8Array([9, 8, 7])], "b.png", {
      type: "image/png",
    });

    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("first"));
    vi.spyOn(Response.prototype, "arrayBuffer").mockRejectedValue(
      new Error("second"),
    );

    expect(bytes_of(await read_file_bytes(file))).toEqual([9, 8, 7]);
  });
});
