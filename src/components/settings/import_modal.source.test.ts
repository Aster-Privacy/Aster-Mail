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

import { derive_manual_import_source } from "./import_modal";

function make_files(names: string[]): File[] {
  return names.map((name) => new File(["x"], name, { type: "message/rfc822" }));
}

describe("derive_manual_import_source", () => {
  it("labels a folder of eml files as eml, not mbox", () => {
    const files = make_files(
      Array.from({ length: 300 }, (_, i) => `message_${i}.eml`),
    );

    expect(derive_manual_import_source(files)).toBe("eml");
  });

  it("labels a single eml as eml", () => {
    expect(derive_manual_import_source(make_files(["a.eml"]))).toBe("eml");
  });

  it("labels an mbox upload as mbox", () => {
    expect(derive_manual_import_source(make_files(["archive.mbox"]))).toBe(
      "mbox",
    );
  });

  it("prefers mbox when both formats are present", () => {
    expect(
      derive_manual_import_source(make_files(["a.eml", "archive.mbox"])),
    ).toBe("mbox");
  });

  it("is case insensitive on extensions", () => {
    expect(derive_manual_import_source(make_files(["A.EML"]))).toBe("eml");
  });

  it("defaults to mbox when nothing matches", () => {
    expect(derive_manual_import_source(make_files(["notes.txt"]))).toBe("mbox");
  });
});
