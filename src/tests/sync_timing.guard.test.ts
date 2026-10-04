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
import { join } from "node:path";

import ts from "typescript";
import { describe, it, expect } from "vitest";

const src = join(process.cwd(), "src");

function runtime_imports(file: string): Map<string, string[]> {
  const text = readFileSync(join(src, file), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
  const imports = new Map<string, string[]>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;

    if (clause?.isTypeOnly) continue;
    const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    const names: string[] = [];
    const bindings = clause?.namedBindings;

    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) {
          names.push((element.propertyName ?? element.name).text);
        }
      }
    }
    imports.set(specifier, [...(imports.get(specifier) ?? []), ...names]);
  }

  return imports;
}

describe("sync timing constants", () => {
  it("keeps the timing module free of imports", () => {
    expect([...runtime_imports("services/sync_timing.ts").keys()]).toEqual([]);
  });

  it.each([
    "hooks/use_email_list_events.ts",
    "components/email/use_email_viewer.ts",
  ])("%s reads the catch-up interval from the timing module", (file) => {
    const imports = runtime_imports(file);

    expect(imports.get("@/services/sync_client") ?? []).not.toContain(
      "CATCH_UP_WHILE_LIVE_MS",
    );
    expect(imports.get("@/services/sync_timing")).toContain(
      "CATCH_UP_WHILE_LIVE_MS",
    );
  });
});
