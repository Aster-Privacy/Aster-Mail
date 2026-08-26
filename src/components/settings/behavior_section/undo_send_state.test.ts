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

import {
  UNDO_PRESET_SECONDS,
  clamp_undo_seconds,
  undo_send_is_active,
} from "./shared";

describe("undo_send_is_active", () => {
  it("treats an unset preference as active", () => {
    expect(undo_send_is_active(undefined, undefined)).toBe(true);
  });

  it("reports the toggle as off when undo send is disabled", () => {
    expect(undo_send_is_active(false, 10)).toBe(false);
  });

  it("reports the toggle as off when another client stored zero seconds", () => {
    expect(undo_send_is_active(true, 0)).toBe(false);
  });

  it("stays active for a positive cancellation period", () => {
    expect(undo_send_is_active(true, 20)).toBe(true);
  });
});

describe("undo send presets", () => {
  it("offers the same cancellation periods every client offers", () => {
    expect([...UNDO_PRESET_SECONDS]).toEqual([3, 5, 10, 15, 20, 30]);
  });

  it("restores the default when a stored value is out of range", () => {
    expect(clamp_undo_seconds(0)).toBe(10);
    expect(clamp_undo_seconds(600)).toBe(30);
  });
});
