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

import { get_undo_send_delay_ms } from "./send_queue";

describe("get_undo_send_delay_ms", () => {
  it("sends immediately when undo send is off, even with a legacy period", () => {
    expect(get_undo_send_delay_ms(false, 10, "10 seconds")).toBe(0);
  });

  it("prefers the seconds preference over a stale legacy period", () => {
    expect(get_undo_send_delay_ms(true, 20, "10 seconds")).toBe(20_000);
  });

  it("falls back to the legacy period when seconds are unset", () => {
    expect(get_undo_send_delay_ms(true, undefined, "7 seconds")).toBe(7_000);
  });

  it("treats zero seconds as sending immediately", () => {
    expect(get_undo_send_delay_ms(true, 0, "10 seconds")).toBe(0);
  });
});
