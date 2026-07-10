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

import { sanitize_download_filename } from "./attachment_utils";

const RLO = String.fromCharCode(0x202e);
const NUL = String.fromCharCode(0x00);

describe("sanitize_download_filename", () => {
  it("strips bidi override characters used for extension spoofing", () => {
    const spoof = "invoice" + RLO + "gpj.exe";

    expect(sanitize_download_filename(spoof)).toBe("invoicegpj.exe");
  });

  it("strips control characters", () => {
    expect(sanitize_download_filename("a" + NUL + "b.txt")).toBe("ab.txt");
  });

  it("replaces path separators", () => {
    expect(sanitize_download_filename("a/b\\c.txt")).toBe("a_b_c.txt");
  });

  it("preserves legitimate filenames", () => {
    expect(sanitize_download_filename("Report 2024.pdf")).toBe(
      "Report 2024.pdf",
    );
    expect(sanitize_download_filename("résumé.docx")).toBe("résumé.docx");
  });

  it("falls back to a default when everything is stripped", () => {
    expect(sanitize_download_filename(RLO + RLO)).toBe("download");
  });
});
