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

import { is_server_sealed_envelope_marker } from "./envelope_markers";

describe("is_server_sealed_envelope_marker", () => {
  it("accepts every server sealed envelope format, including owner bound ones", () => {
    for (const marker of [2, 3, 4, 5, 6]) {
      expect(is_server_sealed_envelope_marker(marker)).toBe(true);
    }
  });

  it("rejects other leading bytes", () => {
    for (const marker of [0, 1, 7, 0x7b, 255]) {
      expect(is_server_sealed_envelope_marker(marker)).toBe(false);
    }
    expect(is_server_sealed_envelope_marker(null)).toBe(false);
    expect(is_server_sealed_envelope_marker(undefined)).toBe(false);
  });
});
