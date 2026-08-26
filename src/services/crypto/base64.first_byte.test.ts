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

import { array_to_base64, base64_to_array, first_base64_byte } from "./base64";

describe("first_base64_byte", () => {
  it("matches a full decode for every leading byte value", () => {
    for (let value = 0; value < 256; value += 1) {
      const bytes = new Uint8Array([value, 7, 9, 11, 13]);
      const encoded = array_to_base64(bytes);

      expect(first_base64_byte(encoded)).toBe(base64_to_array(encoded)[0]);
    }
  });

  it("matches a full decode for short payloads", () => {
    for (const length of [1, 2, 3, 4, 5]) {
      const bytes = new Uint8Array(length).fill(0);

      bytes[0] = 3;

      const encoded = array_to_base64(bytes);

      expect(first_base64_byte(encoded)).toBe(3);
    }
  });

  it("matches a full decode for a large payload", () => {
    const bytes = new Uint8Array(300000);

    bytes[0] = 4;
    bytes[1] = 200;

    const encoded = array_to_base64(bytes);

    expect(first_base64_byte(encoded)).toBe(4);
  });

  it("returns -1 for empty input", () => {
    expect(first_base64_byte("")).toBe(-1);
  });
});

describe("array_to_base64", () => {
  it("round-trips payloads larger than one chunk", () => {
    const bytes = new Uint8Array(70000);

    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;

    expect(Array.from(base64_to_array(array_to_base64(bytes)))).toEqual(
      Array.from(bytes),
    );
  });
});
