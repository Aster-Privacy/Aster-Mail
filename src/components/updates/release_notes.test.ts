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
import { describe, expect, it } from "vitest";

import { parse_release_notes, tokenize_release_note } from "./release_notes";

const BODY = `<p align="left">
  <picture>
    <img alt="Aster Mail" src="https://example.org/logo.png" width="320">
  </picture>
</p>

> [!NOTE]
> These files are for new installations.

## What's new

- Search has new filter chips, so you can narrow results
  without typing search operators.
- On a Mac, the button reads **Show in Finder**.

## Fixed

* Printing works [reliably](https://example.org).

## Verify the APK

- **Package name:** \`org.astermail.android\`
`;

describe("parse_release_notes", () => {
  it("keeps note sections and drops the wordmark, alert, and verification", () => {
    expect(parse_release_notes(BODY)).toEqual([
      {
        title: "What's new",
        items: [
          "Search has new filter chips, so you can narrow results without typing search operators.",
          "On a Mac, the button reads **Show in Finder**.",
        ],
      },
      { title: "Fixed", items: ["Printing works reliably."] },
    ]);
  });

  it("returns nothing for empty notes", () => {
    expect(parse_release_notes("")).toEqual([]);
    expect(parse_release_notes(undefined)).toEqual([]);
    expect(parse_release_notes("> [!NOTE]\n> Only an alert.")).toEqual([]);
  });

  it("treats plain lines without headings as items", () => {
    expect(parse_release_notes("First change.\n\nSecond change.")).toEqual([
      { title: null, items: ["First change.", "Second change."] },
    ]);
  });
});

describe("tokenize_release_note", () => {
  it("splits bold and code spans", () => {
    expect(tokenize_release_note("Open **Settings** and run `x`.")).toEqual([
      { kind: "text", text: "Open " },
      { kind: "strong", text: "Settings" },
      { kind: "text", text: " and run " },
      { kind: "code", text: "x" },
      { kind: "text", text: "." },
    ]);
  });
});
