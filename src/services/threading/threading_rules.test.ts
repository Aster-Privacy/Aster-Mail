//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import {
  has_reply_prefix,
  normalize_subject,
} from "@/services/threading/threading_rules";

describe("normalize_subject", () => {
  it.each([
    ["Re: Plans", "plans"],
    ["RE: Plans", "plans"],
    ["Re:Plans", "plans"],
    ["Re:Re: Plans", "plans"],
    ["Re: Re: Re: Plans", "plans"],
    ["Re[2]: Plans", "plans"],
    ["Re [3]: Plans", "plans"],
    ["Re(2): Plans", "plans"],
    ["Re^2: Plans", "plans"],
    ["RE: FW: Fwd: Plans", "plans"],
    ["Fwd:Fw:Plans", "plans"],
    ["Fw : Plans", "plans"],
    ["AW: WG: Plans", "plans"],
    ["SV: VS: Plans", "plans"],
    ["Antw: Doorst: Plans", "plans"],
    ["Rif: Plans", "plans"],
    ["Odp: Plans", "plans"],
    ["TR: RV: Plans", "plans"],
    ["Enc: Res: Plans", "plans"],
    ["Ref: Plans", "plans"],
    ["Réf : Plans", "plans"],
    ["Отв: Plans", "plans"],
    ["回复：Plans", "plans"],
    ["  Re:   Plans  ", "plans"],
  ])("strips %s", (subject, expected) => {
    expect(normalize_subject(subject)).toBe(expected);
  });

  it.each([
    ["Plans", "plans"],
    ["Regarding: Plans", "regarding: plans"],
    ["Review: Plans", "review: plans"],
    ["Resume tips", "resume tips"],
    ["Forward planning", "forward planning"],
    ["Plans: Re: budget", "plans: re: budget"],
    ["Ticket [2]: Plans", "ticket [2]: plans"],
    ["", ""],
  ])("keeps %s", (subject, expected) => {
    expect(normalize_subject(subject)).toBe(expected);
  });
});

describe("has_reply_prefix", () => {
  it("detects stacked and counted prefixes", () => {
    expect(has_reply_prefix("Re[2]: Plans")).toBe(true);
    expect(has_reply_prefix("re:re: Plans")).toBe(true);
    expect(has_reply_prefix("FW: Plans")).toBe(true);
  });

  it("ignores subjects without a prefix", () => {
    expect(has_reply_prefix("Plans")).toBe(false);
    expect(has_reply_prefix("Regarding Plans")).toBe(false);
  });
});
