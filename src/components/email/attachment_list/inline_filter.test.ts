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

import { is_inline_attachment } from "./types";

describe("is_inline_attachment", () => {
  it("hides an image the body embeds by content id", () => {
    expect(
      is_inline_attachment(
        {
          filename: "logo.png",
          content_type: "image/png",
          content_id: "logo123",
        },
        { inline_cids: new Set(["logo123"]) },
      ),
    ).toBe(true);
  });

  it("hides an image the body embeds by alt filename", () => {
    expect(
      is_inline_attachment(
        { filename: "signature.png", content_type: "image/png" },
        { inline_filenames: new Set(["signature.png"]) },
      ),
    ).toBe(true);
  });

  it("keeps a screenshot the sender marked inline but never embedded", () => {
    expect(
      is_inline_attachment(
        {
          filename: "screenshot_1.png",
          content_type: "image/png",
          content_id: "unreferenced",
          is_inline: true,
        },
        { inline_cids: new Set(), inline_filenames: new Set() },
      ),
    ).toBe(false);
  });

  it("keeps an inline-marked pdf", () => {
    expect(
      is_inline_attachment(
        {
          filename: "invoice.pdf",
          content_type: "application/pdf",
          is_inline: true,
        },
        { inline_cids: new Set(["logo123"]) },
      ),
    ).toBe(false);
  });

  it("keeps an attachment when the body has not been parsed yet", () => {
    expect(
      is_inline_attachment(
        { filename: "photo.jpg", content_type: "image/jpeg", is_inline: true },
        {},
      ),
    ).toBe(false);
  });
});
