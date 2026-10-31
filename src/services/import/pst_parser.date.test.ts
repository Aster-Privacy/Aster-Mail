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
import { describe, expect, it, vi } from "vitest";

const messages: Record<string, unknown>[] = [];

vi.mock("pst-extractor", () => ({
  PSTFile: class {
    getRootFolder() {
      let next = 0;

      return {
        contentCount: messages.length,
        hasSubfolders: false,
        getNextChild: () => messages[next++] ?? null,
      };
    }
  },
}));

import { parse_pst_file } from "./pst_parser";

function pst_file(): File {
  return new File([new Uint8Array(8)], "archive.pst");
}

describe("parse_pst_file dates", () => {
  it("marks messages without a stored date as inferred", async () => {
    messages.length = 0;
    messages.push(
      { subject: "dated", clientSubmitTime: new Date("2020-01-02T03:04:05Z") },
      { subject: "undated" },
      { subject: "broken", messageDeliveryTime: new Date("invalid") },
    );

    const result = await parse_pst_file(pst_file());

    expect(result.emails.map((e) => e.date_inferred)).toEqual([
      false,
      true,
      true,
    ]);
    expect(result.emails[0].date.toISOString()).toBe(
      "2020-01-02T03:04:05.000Z",
    );
    expect(isNaN(result.emails[2].date.getTime())).toBe(false);
  });
});
