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

import {
  derive_accepted_languages,
  primary_target,
  language_display_name,
} from "./accepted_languages";

describe("derive_accepted_languages", () => {
  it("uses configured languages when present", () => {
    expect(derive_accepted_languages(["de", "fr"], "en", ["es"])).toEqual([
      "de",
      "fr",
    ]);
  });

  it("normalizes and dedupes configured languages", () => {
    expect(
      derive_accepted_languages(["de-DE", "DE", "fr_FR"], "en", []),
    ).toEqual(["de", "fr"]);
  });

  it("drops unsupported configured languages", () => {
    expect(derive_accepted_languages(["xx", "de", "zz"], "en", [])).toEqual([
      "de",
    ]);
  });

  it("seeds from ui locale then navigator when nothing configured", () => {
    expect(derive_accepted_languages([], "de-DE", ["fr-FR", "es"])).toEqual([
      "de",
      "fr",
      "es",
    ]);
  });

  it("ignores navigator languages once configured is non-empty", () => {
    expect(derive_accepted_languages(["it"], "de", ["fr", "es"])).toEqual([
      "it",
    ]);
  });

  it("falls back to the pivot language when everything is unsupported", () => {
    expect(derive_accepted_languages([], "xx", ["zz"])).toEqual(["en"]);
  });
});

describe("primary_target", () => {
  it("returns the first accepted language", () => {
    expect(primary_target(["fr", "de"])).toBe("fr");
  });

  it("falls back to the pivot language when empty", () => {
    expect(primary_target([])).toBe("en");
  });
});

describe("language_display_name", () => {
  it("returns a human readable name for a supported language", () => {
    expect(language_display_name("de", "en")).toBe("German");
  });

  it("localizes the name into the ui locale", () => {
    expect(language_display_name("de", "de")).toBe("Deutsch");
  });

  it("always returns a non-empty label", () => {
    for (const code of ["ar", "ja", "zh", "en"] as const) {
      expect(language_display_name(code, "en").length).toBeGreaterThan(0);
    }
  });
});
