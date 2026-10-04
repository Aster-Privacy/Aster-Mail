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

import { parse_headers } from "./mime_utils";

describe("parse_headers duplicate label headers", () => {
  it("keeps the first label header when a message repeats it", () => {
    const headers = parse_headers(
      [
        "X-Gmail-Labels: Inbox,Work",
        "From: sender@example.com",
        "X-Gmail-Labels: Injected One,Injected Two",
        "Subject: hello",
      ].join("\r\n"),
    );

    expect(headers["x-gmail-labels"]).toBe("Inbox,Work");
    expect(headers.subject).toBe("hello");
  });

  it("keeps the first keywords header when a message repeats it", () => {
    const headers = parse_headers(
      [
        "X-Keywords: work",
        "x-keywords: injected",
        "X-KEYWORDS: injected again",
      ].join("\n"),
    );

    expect(headers["x-keywords"]).toBe("work");
  });

  it("keeps the folded value of the first label header", () => {
    const headers = parse_headers(
      [
        "X-Gmail-Labels: Inbox,",
        " Work",
        "X-Gmail-Labels: Injected",
        " More",
      ].join("\r\n"),
    );

    expect(headers["x-gmail-labels"]).toBe("Inbox, Work");
  });

  it("still lets the last value win for other repeated headers", () => {
    const headers = parse_headers(
      ["Subject: first", "Subject: second"].join("\r\n"),
    );

    expect(headers.subject).toBe("second");
  });
});
