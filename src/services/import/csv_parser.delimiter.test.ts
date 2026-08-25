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

import { parse_csv_file } from "./csv_parser";

function make_file(content: string, name: string): File {
  return new File([content], name, { type: "text/plain" });
}

describe("parse_csv_file delimiters", () => {
  it("parses tab separated files", async () => {
    const content =
      ["from@x.com", "to@y.com", "Tabbed subject", "Tabbed body"].join("\t");
    const result = await parse_csv_file(
      make_file("from\tto\tsubject\tbody\n" + content, "export.tsv"),
    );

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe("Tabbed subject");
    expect(result.emails[0].from).toContain("from@x.com");
  });

  it("still parses comma separated files", async () => {
    const result = await parse_csv_file(
      make_file(
        "from,to,subject,body\nfrom@x.com,to@y.com,Comma subject,Comma body",
        "export.csv",
      ),
    );

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe("Comma subject");
  });
});
