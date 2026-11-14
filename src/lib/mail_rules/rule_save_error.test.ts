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

import { classify_rule_save_error } from "./rule_save_error";

describe("classify_rule_save_error", () => {
  it("ignores messages from other checks", () => {
    expect(classify_rule_save_error("Rule name is required.", "")).toBeNull();
    expect(classify_rule_save_error(null, "")).toBeNull();
  });

  it("recognizes regex errors", () => {
    expect(
      classify_rule_save_error(
        "regex condition: invalid regex: unclosed group",
        "",
      ),
    ).toEqual({ kind: "regex", reason: "invalid", detail: "unclosed group" });
    expect(
      classify_rule_save_error("regex condition: invalid regex", ""),
    ).toEqual({ kind: "regex", reason: "invalid", detail: null });
    expect(
      classify_rule_save_error(
        "regex condition: regex pattern is too complex",
        "",
      ),
    ).toEqual({ kind: "regex", reason: "too_complex" });
  });

  it("maps a known reason and position to line and column", () => {
    const expression = '  subject contains "a"\nand body contains "b';

    expect(
      classify_rule_save_error(
        "expression: expression error at 39: unterminated string literal",
        expression,
      ),
    ).toEqual({
      kind: "expression",
      code: "unterminated_string",
      line: 2,
      col: 19,
    });
  });

  it("includes the token for reasons that name a value", () => {
    expect(
      classify_rule_save_error(
        "expression: expression error at 0: unknown field",
        'bogus contains "x"',
      ),
    ).toEqual({
      kind: "expression",
      code: "unknown_field:bogus",
      line: 1,
      col: 1,
    });
  });

  it("converts byte offsets after multibyte text", () => {
    const expression = 'subject contains "é" nope';

    expect(
      classify_rule_save_error(
        "expression: expression error at 22: unexpected trailing input",
        expression,
      ),
    ).toEqual({
      kind: "expression",
      code: "unexpected_token:nope",
      line: 1,
      col: 22,
    });
  });

  it("falls back to a generic code for unmapped reasons", () => {
    expect(
      classify_rule_save_error(
        "expression: expression error at 0: invalid utf-8 in identifier",
        "x",
      ),
    ).toEqual({
      kind: "expression",
      code: "server_rejected",
      line: 1,
      col: 1,
    });
  });
});
