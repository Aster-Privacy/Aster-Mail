//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import { ALLOWED_TAGS, DANGEROUS_TAGS } from "./html_sanitizer_constants";

describe("html_sanitizer_constants", () => {
  const must_be_dangerous = [
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "base",
    "frame",
    "frameset",
    "link",
    "meta",
  ];

  it("blocks tags that enable phishing or script injection", () => {
    for (const tag of must_be_dangerous) {
      expect(DANGEROUS_TAGS.has(tag), `${tag} must be in DANGEROUS_TAGS`).toBe(true);
      expect(ALLOWED_TAGS.has(tag), `${tag} must NOT be in ALLOWED_TAGS`).toBe(false);
    }
  });

  it("does not allow form-control tags in any list", () => {
    for (const tag of ["form", "input", "button", "select", "textarea"]) {
      expect(ALLOWED_TAGS.has(tag)).toBe(false);
    }
  });
});
