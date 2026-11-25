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

import { detect_verification_code } from "./verification_code";
import { VERIFICATION_CODE_CASES } from "./verification_code.corpus";
import { build_body_preview } from "./preview_text";

const positive_cases = VERIFICATION_CODE_CASES.filter(
  (entry) => entry.expected !== null,
);
const negative_cases = VERIFICATION_CODE_CASES.filter(
  (entry) => entry.expected === null,
);

describe("verification code corpus", () => {
  it("covers at least sixty cases on each side", () => {
    expect(positive_cases.length).toBeGreaterThanOrEqual(60);
    expect(negative_cases.length).toBeGreaterThanOrEqual(60);
  });

  it.each(positive_cases.map((entry) => [entry.subject, entry.body, entry]))(
    "finds the code in %j / %j",
    (_subject, _body, entry) => {
      expect(
        detect_verification_code(entry.subject, entry.body, entry.sender),
      ).toBe(entry.expected);
    },
  );

  it.each(negative_cases.map((entry) => [entry.subject, entry.body, entry]))(
    "finds no code in %j / %j",
    (_subject, _body, entry) => {
      expect(
        detect_verification_code(entry.subject, entry.body, entry.sender),
      ).toBeNull();
    },
  );
});

describe("detect_verification_code inputs", () => {
  it("ignores missing and empty sources", () => {
    expect(detect_verification_code(null, undefined)).toBeNull();
    expect(detect_verification_code("", "")).toBeNull();
    expect(detect_verification_code(null, "Your code is 918273")).toBe(
      "918273",
    );
  });

  it("reads a code from an HTML-only body through the list preview", () => {
    const html =
      "<html><body><table><tr><td><h1>Sign in to Example</h1></td></tr>" +
      "<tr><td><p>Your verification code is</p><p><strong>604 218</strong></p>" +
      "<p>This code expires in 10 minutes.</p></td></tr></table></body></html>";

    expect(
      detect_verification_code(
        "Your Example code",
        build_body_preview("", html),
        "no-reply@example.com",
      ),
    ).toBe("604218");
  });

  it("ignores a code in an HTML-only reply that quotes an earlier message", () => {
    const html =
      "<div>Thanks, that worked.</div><blockquote><p>Your verification code is 482913</p></blockquote>";

    expect(
      detect_verification_code(
        "Re: Your account",
        build_body_preview("", html),
        "friend@example.com",
      ),
    ).toBeNull();
  });

  it("treats an automated sender address in display form as automated", () => {
    expect(
      detect_verification_code(
        "Re: Sign-in request",
        "Use 481920 to finish signing in",
        "Example Security <no-reply@example.com>",
      ),
    ).toBe("481920");
    expect(
      detect_verification_code(
        "Re: Sign-in request",
        "Use 481920 to finish signing in",
        "Sam <sam@example.com>",
      ),
    ).toBeNull();
  });
});
