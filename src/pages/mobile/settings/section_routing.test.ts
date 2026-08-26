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

import { resolve_mobile_section } from "@/pages/mobile/settings/section_routing";

function union_members(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), "src/pages/mobile/settings/shared.tsx"),
    "utf-8",
  );
  const start = source.indexOf("export type SettingsSection =");
  const end = source.indexOf(";", start);

  return Array.from(source.slice(start, end).matchAll(/"([^"]+)"/g)).map(
    (match) => match[1],
  );
}

describe("resolve_mobile_section", () => {
  it("accepts every section the mobile settings page can render", () => {
    const members = union_members();

    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      expect(resolve_mobile_section(member)).toBe(member);
    }
  });

  it("maps desktop-only section ids onto their mobile equivalent", () => {
    expect(resolve_mobile_section("signature")).toBe("signatures");
    expect(resolve_mobile_section("bridge")).toBe("connection");
    expect(resolve_mobile_section("smtp_tokens")).toBe("connection");
    expect(resolve_mobile_section("updates")).toBe("about");
  });

  it("rejects an unknown section instead of opening a blank screen", () => {
    expect(resolve_mobile_section("does_not_exist")).toBeNull();
    expect(resolve_mobile_section("")).toBeNull();
    expect(resolve_mobile_section(null)).toBeNull();
    expect(resolve_mobile_section(undefined)).toBeNull();
  });
});
