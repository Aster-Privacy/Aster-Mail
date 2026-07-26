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

import { en } from "@/lib/i18n/translations/en";

import {
  detect_unsupported_regex_syntax,
  validate_regex_pattern,
  find_regex_condition_error,
  type Condition,
} from "./mail_rules";

const regex_condition = (value: string): Condition =>
  ({
    type: "subject",
    operator: "matches_regex",
    value,
  }) as unknown as Condition;

describe("detect_unsupported_regex_syntax", () => {
  it("accepts patterns the Rust regex crate supports", () => {
    for (const pattern of [
      "^invoice",
      "(alpha|beta)+",
      "[a-z0-9_.-]+@example\\.com",
      "\\d{4}-\\d{2}-\\d{2}",
      "(?i)urgent",
      "(?:group)?",
      "a\\\\1b",
      "[\\1]",
      "[]]",
    ]) {
      expect(detect_unsupported_regex_syntax(pattern)).toBeNull();
    }
  });

  it("flags numeric backreferences", () => {
    expect(detect_unsupported_regex_syntax("(\\w+)\\s\\1")).toBe(
      "regex_backreference",
    );
    expect(detect_unsupported_regex_syntax("(a)(b)\\2")).toBe(
      "regex_backreference",
    );
  });

  it("flags named backreferences", () => {
    expect(detect_unsupported_regex_syntax("(?P<w>\\w+) \\k<w>")).toBe(
      "regex_backreference",
    );
  });

  it("flags lookahead and lookbehind", () => {
    expect(detect_unsupported_regex_syntax("(?=urgent)")).toBe(
      "regex_lookaround",
    );
    expect(detect_unsupported_regex_syntax("foo(?!bar)")).toBe(
      "regex_lookaround",
    );
    expect(detect_unsupported_regex_syntax("(?<=re: )ticket")).toBe(
      "regex_lookaround",
    );
    expect(detect_unsupported_regex_syntax("(?<!un)happy")).toBe(
      "regex_lookaround",
    );
  });

  it("does not flag lookaround-shaped text inside a character class", () => {
    expect(detect_unsupported_regex_syntax("[(?=]")).toBeNull();
  });
});

describe("validate_regex_pattern", () => {
  it("rejects an empty pattern", () => {
    expect(validate_regex_pattern("")).toBe("regex_empty");
  });

  it("rejects a pattern over the backend length cap", () => {
    expect(validate_regex_pattern("a".repeat(513))).toBe("regex_too_long");
    expect(validate_regex_pattern("a".repeat(512))).toBeNull();
  });

  it("reports unsupported syntax before generic invalidity", () => {
    expect(validate_regex_pattern("(?=x)")).toBe("regex_lookaround");
    expect(validate_regex_pattern("(x)\\1")).toBe("regex_backreference");
  });

  it("rejects a malformed pattern", () => {
    expect(validate_regex_pattern("(unclosed")).toBe("regex_invalid");
    expect(validate_regex_pattern("[a-")).toBe("regex_invalid");
  });

  it("accepts a supported pattern", () => {
    expect(validate_regex_pattern("^\\[ALERT\\]")).toBeNull();
  });
});

describe("find_regex_condition_error", () => {
  it("returns null when no condition uses a regex operator", () => {
    expect(
      find_regex_condition_error([
        { type: "subject", operator: "contains", value: "(?=x)" } as unknown as Condition,
      ]),
    ).toBeNull();
  });

  it("finds a problem in a flat condition list", () => {
    expect(find_regex_condition_error([regex_condition("(?=x)")])).toBe(
      "regex_lookaround",
    );
  });

  it("recurses into and groups", () => {
    expect(
      find_regex_condition_error([
        { type: "and", conditions: [regex_condition("(a)\\1")] },
      ]),
    ).toBe("regex_backreference");
  });

  it("recurses into or groups", () => {
    expect(
      find_regex_condition_error([
        { type: "or", conditions: [regex_condition("(unclosed")] },
      ]),
    ).toBe("regex_invalid");
  });

  it("recurses into not groups", () => {
    expect(
      find_regex_condition_error([
        { type: "not", condition: regex_condition("(?<=a)b") },
      ]),
    ).toBe("regex_lookaround");
  });

  it("recurses through nested groups", () => {
    expect(
      find_regex_condition_error([
        {
          type: "and",
          conditions: [
            regex_condition("^ok$"),
            { type: "not", condition: { type: "or", conditions: [regex_condition("(?!x)")] } },
          ],
        },
      ]),
    ).toBe("regex_lookaround");
  });

  it("returns null when every regex condition is supported", () => {
    expect(
      find_regex_condition_error([
        regex_condition("^ok$"),
        { type: "and", conditions: [regex_condition("[0-9]+")] },
      ]),
    ).toBeNull();
  });
});

describe("regex error translations", () => {
  it("has a string for every code the validator can return", () => {
    for (const code of [
      "regex_empty",
      "regex_too_long",
      "regex_invalid",
      "regex_backreference",
      "regex_lookaround",
    ] as const) {
      expect(en.mail_rules[code]).toBeTruthy();
    }
  });
});
