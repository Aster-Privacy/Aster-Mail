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
import { describe, it, expect, vi } from "vitest";

import { resolve_password_change_error } from "./password_change_error";
import { en } from "@/lib/i18n/translations/en";
import type { TranslationKey } from "@/lib/i18n/types";

const translate = (key: TranslationKey): string => {
  const [namespace, name] = key.split(".");

  return (en as unknown as Record<string, Record<string, string>>)[namespace][
    name
  ];
};

describe("resolve_password_change_error", () => {
  it("never lets the raw fingerprint code reach the interface", () => {
    const resolved = resolve_password_change_error(
      "FINGERPRINT_MISMATCH",
      translate,
    );

    expect(resolved).not.toContain("FINGERPRINT_MISMATCH");
    expect(resolved).toBe(en.settings.password_change_fingerprint_mismatch);
  });

  it("returns an actionable sentence telling the user to sign in again", () => {
    const resolved = resolve_password_change_error(
      "FINGERPRINT_MISMATCH",
      translate,
    );

    expect(resolved).toMatch(/sign out/i);
    expect(resolved).toMatch(/sign back in/i);
    expect(resolved.trim().split(/\s+/).length).toBeGreaterThan(5);
  });

  it("matches the code regardless of surrounding whitespace or case", () => {
    for (const raw of [
      "  FINGERPRINT_MISMATCH  ",
      "fingerprint_mismatch",
      "Fingerprint_Mismatch",
    ]) {
      expect(resolve_password_change_error(raw, translate)).toBe(
        en.settings.password_change_fingerprint_mismatch,
      );
    }
  });

  it("leaves every other server error untouched", () => {
    const translate_spy = vi.fn(translate);

    expect(
      resolve_password_change_error(
        "Current password is incorrect",
        translate_spy,
      ),
    ).toBe("Current password is incorrect");
    expect(
      resolve_password_change_error("Rate limit exceeded", translate_spy),
    ).toBe("Rate limit exceeded");
    expect(translate_spy).not.toHaveBeenCalled();
  });

  it("resolves the code in every supported locale without leaking it", async () => {
    const locales = await Promise.all([
      import("@/lib/i18n/translations/ar"),
      import("@/lib/i18n/translations/de"),
      import("@/lib/i18n/translations/en"),
      import("@/lib/i18n/translations/es"),
      import("@/lib/i18n/translations/fr"),
      import("@/lib/i18n/translations/it"),
      import("@/lib/i18n/translations/ja"),
      import("@/lib/i18n/translations/ko"),
      import("@/lib/i18n/translations/nl"),
      import("@/lib/i18n/translations/pl"),
      import("@/lib/i18n/translations/pt"),
      import("@/lib/i18n/translations/ru"),
      import("@/lib/i18n/translations/tr"),
      import("@/lib/i18n/translations/zh-CN"),
    ]);

    expect(locales).toHaveLength(14);

    for (const locale of locales) {
      const bundle = Object.values(locale)[0] as {
        settings: Record<string, string>;
      };
      const message = bundle.settings.password_change_fingerprint_mismatch;

      expect(message).toBeTruthy();
      expect(message).not.toContain("FINGERPRINT_MISMATCH");
    }
  });
});
