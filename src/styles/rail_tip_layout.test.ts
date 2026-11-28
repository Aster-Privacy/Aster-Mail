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

const flat_css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ");

function rule_body(selector: string): string | null {
  const at = flat_css.indexOf(`${selector} {`);

  if (at === -1) return null;
  const open_brace = flat_css.indexOf("{", at);

  return flat_css.slice(open_brace + 1, flat_css.indexOf("}", open_brace));
}

describe("rail tip layout", () => {
  it("keeps arrowed rail tips on one line so they measure true before moving beside the rail", () => {
    const wrap_rule = rule_body(".aster_tip_portal");
    const arrow_rule = rule_body(".aster_tip_portal[data-tip-arrow]");

    expect(wrap_rule).toContain("white-space: normal");
    expect(arrow_rule).toContain("white-space: nowrap");
    const wrap_at = flat_css.indexOf(".aster_tip_portal {");
    const arrow_at = flat_css.indexOf(".aster_tip_portal[data-tip-arrow] {");

    expect(arrow_at).toBeGreaterThan(wrap_at);
  });
});
