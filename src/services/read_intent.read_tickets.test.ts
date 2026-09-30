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
  begin_read_change,
  capture_read_tickets,
  claim_auto_read,
  current_read_ids,
  is_read_ticket_current,
  peek_read_ticket,
} from "./read_intent";

describe("read tickets", () => {
  it("makes an older ticket stale once a newer change begins", () => {
    const first = begin_read_change(["t_a"]);

    expect(is_read_ticket_current("t_a", first)).toBe(true);
    const second = begin_read_change(["t_a"]);

    expect(is_read_ticket_current("t_a", first)).toBe(false);
    expect(is_read_ticket_current("t_a", second)).toBe(true);
    expect(peek_read_ticket("t_a")).toBe(second);
  });

  it("keeps only the ids that nothing newer touched", () => {
    const ticket = begin_read_change(["t_b", "t_c", "t_d"]);

    begin_read_change(["t_c"]);
    expect(current_read_ids(["t_b", "t_c", "t_d"], ticket)).toEqual([
      "t_b",
      "t_d",
    ]);
  });

  it("compares captured tickets per id", () => {
    begin_read_change(["t_e"]);
    const captured = capture_read_tickets(["t_e", "t_f"]);

    begin_read_change(["t_f"]);
    expect(current_read_ids(["t_e", "t_f"], captured)).toEqual(["t_e"]);
  });

  it("skips an armed auto read when the user toggled in the meantime", () => {
    const armed = peek_read_ticket("t_g");

    begin_read_change(["t_g"]);
    expect(claim_auto_read("t_g", armed)).toBeNull();
  });

  it("claims an armed auto read when nothing changed", () => {
    const armed = peek_read_ticket("t_h");
    const claimed = claim_auto_read("t_h", armed);

    expect(claimed).not.toBeNull();
    expect(is_read_ticket_current("t_h", claimed!)).toBe(true);
    expect(is_read_ticket_current("t_h", armed)).toBe(false);
  });
});
