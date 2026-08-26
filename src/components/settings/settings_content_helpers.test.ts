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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

import {
  SETTINGS_SECTION_IDS,
  resolve_settings_section,
} from "@/components/settings/settings_content_helpers";

function rendered_sections(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/settings/settings_content.tsx"),
    "utf-8",
  );

  return Array.from(source.matchAll(/case "([a-z_]+)":/g)).map(
    (match) => match[1],
  );
}

describe("resolve_settings_section", () => {
  it("accepts every section the desktop settings page can render", () => {
    for (const id of SETTINGS_SECTION_IDS) {
      expect(resolve_settings_section(id)).toBe(id);
    }
  });

  it("keeps the section list in step with what settings content renders", () => {
    const rendered = rendered_sections();

    expect(rendered.length).toBeGreaterThan(0);
    for (const id of SETTINGS_SECTION_IDS) {
      expect(rendered).toContain(id);
    }
  });

  it("maps mobile-only section ids onto their desktop equivalent", () => {
    expect(resolve_settings_section("ghost_aliases")).toBe("aliases");
    expect(resolve_settings_section("alias_directories")).toBe("aliases");
    expect(resolve_settings_section("connection")).toBe("bridge");
    expect(resolve_settings_section("signatures")).toBe("signature");
    expect(resolve_settings_section("about")).toBe("updates");
    expect(resolve_settings_section("external_accounts")).toBe("import");
  });

  it("rejects an unknown section instead of opening a blank pane", () => {
    expect(resolve_settings_section("does_not_exist")).toBeUndefined();
    expect(resolve_settings_section("")).toBeUndefined();
    expect(resolve_settings_section(null)).toBeUndefined();
    expect(resolve_settings_section(undefined)).toBeUndefined();
  });
});
