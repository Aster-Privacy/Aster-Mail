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
  build_merged_preferences,
  DEFAULT_PREFERENCES,
  explicit_language_preference,
} from "./preferences";

import { label_to_language_code } from "@/contexts/preferences_context/helpers";
import { get_display_name, get_native_label } from "@/lib/i18n/languages";

describe("explicit_language_preference", () => {
  it.each(["en", "pt", "pt-BR", "zh-CN", "ar"] as const)(
    "marks %s as an explicit choice with a label that maps back to the code",
    (code) => {
      const update = explicit_language_preference(code);

      expect(update.language_explicit).toBe(true);
      expect(label_to_language_code(update.language)).toBe(code);
    },
  );

  it("keeps the explicit flag another client wrote to the server blob", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      language: "Deutsch",
      language_explicit: true,
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.language_explicit).toBe(true);
    expect(merged.language).toBe("Deutsch");
  });
});

describe("get_native_label", () => {
  it("names the region in the language itself", () => {
    expect(get_native_label("pt-BR")).toBe("Português (Brasil)");
    expect(get_native_label("pt")).toBe("Português (Portugal)");
    expect(get_native_label("de")).toBe("Deutsch");
  });

  it("leaves the stored preference label unchanged", () => {
    expect(get_display_name("pt-BR")).toBe("Português (Brazil)");
    expect(label_to_language_code(get_display_name("pt-BR"))).toBe("pt-BR");
  });
});
