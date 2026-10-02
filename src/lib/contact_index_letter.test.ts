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

import { contact_index_letter } from "./contact_index_letter";

describe("contact_index_letter", () => {
  it("files accented Latin initials under their base letter", () => {
    expect(contact_index_letter("Álvaro")).toBe("A");
    expect(contact_index_letter("Ângela")).toBe("A");
    expect(contact_index_letter("élio")).toBe("E");
    expect(contact_index_letter("Óscar")).toBe("O");
    expect(contact_index_letter("Çelik")).toBe("C");
    expect(contact_index_letter("Ñuño")).toBe("N");
  });

  it("folds Latin letters that have no canonical decomposition", () => {
    expect(contact_index_letter("Ærin")).toBe("A");
    expect(contact_index_letter("øyvind")).toBe("O");
    expect(contact_index_letter("Łukasz")).toBe("L");
    expect(contact_index_letter("Đuro")).toBe("D");
    expect(contact_index_letter("Ĳssel")).toBe("I");
  });

  it("keeps letters from other scripts as their own index", () => {
    expect(contact_index_letter("ωmega")).toBe("Ω");
    expect(contact_index_letter("жанна")).toBe("Ж");
    expect(contact_index_letter("김민준")).toBe("김");
    expect(contact_index_letter("山田")).toBe("山");
  });

  it("uses # for names that do not start with a letter", () => {
    expect(contact_index_letter("42 Club")).toBe("#");
    expect(contact_index_letter("😀 Joy")).toBe("#");
    expect(contact_index_letter("@home")).toBe("#");
    expect(contact_index_letter("   ")).toBe("#");
    expect(contact_index_letter("")).toBe("#");
    expect(contact_index_letter(undefined)).toBe("#");
  });

  it("ignores leading whitespace", () => {
    expect(contact_index_letter("  bruno")).toBe("B");
  });
});
