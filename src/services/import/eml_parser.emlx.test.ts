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

import { strip_emlx_wrapper, parse_eml } from "./eml_parser";

const message =
  "From: sender@example.com\nTo: recipient@example.com\nSubject: Quarterly report\n\nThe numbers are attached.\n";

const plist =
  '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>flags</key><integer>8621</integer></dict></plist>\n';

describe("strip_emlx_wrapper", () => {
  it("drops the byte-count prefix and the trailing property list", () => {
    const raw = `${message.length}\n${message}${plist}`;

    expect(strip_emlx_wrapper(raw)).toBe(message);
  });

  it("accepts a carriage return after the byte count", () => {
    const raw = `${message.length}\r\n${message}${plist}`;

    expect(strip_emlx_wrapper(raw)).toBe(message);
  });

  it("leaves a plain eml message untouched", () => {
    expect(strip_emlx_wrapper(message)).toBe(message);
  });

  it("leaves the message untouched when the byte count is zero", () => {
    const raw = `0\n${message}`;

    expect(strip_emlx_wrapper(raw)).toBe(raw);
  });

  it("clamps to the end of the input when the byte count overruns", () => {
    const raw = `999999\n${message}`;

    expect(strip_emlx_wrapper(raw)).toBe(message);
  });

  it("produces a parsable message once the wrapper is gone", () => {
    const parsed = parse_eml(
      strip_emlx_wrapper(`${message.length}\n${message}${plist}`),
    );

    expect(parsed.subject).toBe("Quarterly report");
    expect(parsed.from).toContain("sender@example.com");
  });
});
