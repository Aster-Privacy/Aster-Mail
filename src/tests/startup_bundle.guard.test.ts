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
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import ts from "typescript";
import { describe, it, expect } from "vitest";

const src = join(process.cwd(), "src");
const extensions = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolve_import(from: string, specifier: string): string | null {
  let base: string;

  if (specifier.startsWith("@/")) base = join(src, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;

  for (const extension of extensions) {
    const candidate = base + extension;

    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }

  return null;
}

function is_type_only(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;

  if (!clause) return false;
  if (clause.isTypeOnly) return true;

  const bindings = clause.namedBindings;

  return (
    !clause.name &&
    !!bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function static_imports(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];

  for (const statement of source.statements) {
    let specifier: string | null = null;

    if (ts.isImportDeclaration(statement) && !is_type_only(statement)) {
      specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      !statement.isTypeOnly
    ) {
      specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    }

    const target = specifier ? resolve_import(file, specifier) : null;

    if (target) found.push(target);
  }

  return found;
}

const graph_cache = new Map<string, string[]>();

function eagerly_loaded(entry: string): Set<string> {
  const seen = new Set<string>([join(src, entry)]);
  const queue = [...seen];

  while (queue.length > 0) {
    const file = queue.shift()!;
    let imports = graph_cache.get(file);

    if (!imports) {
      imports = static_imports(file);
      graph_cache.set(file, imports);
    }

    for (const next of imports) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return new Set(
    [...seen].map((file) => relative(src, file).split(sep).join("/")),
  );
}

const RENDERER_AND_UI_MODULES = [
  "lib/email_body_styles.ts",
  "components/email/hooks/preload_cache.ts",
  "components/email/sandboxed_email_renderer/renderer.tsx",
  "components/compose/compose_shared.tsx",
  "components/compose/compose_recipients.tsx",
  "components/compose/emoji_picker.tsx",
  "components/upgrade/upgrade_modal.tsx",
  "components/upgrade/alias_cap_upsell_modal.tsx",
  "components/upgrade/special_offer_modal.tsx",
];

const HEAVY_MODULES = [
  ...RENDERER_AND_UI_MODULES,
  "services/thread_service.ts",
];

const MOBILE_SHELL_MODULES = [
  "components/mobile/index.ts",
  "components/mobile/mobile_drawer.tsx",
  "components/mobile/mobile_email_list.tsx",
  "components/mobile/mobile_email_row.tsx",
  "components/mobile/mobile_fab.tsx",
  "components/mobile/swipe_actions.tsx",
];

function reached(entry: string, modules: string[]): string[] {
  const loaded = eagerly_loaded(entry);

  return modules.filter((module) => loaded.has(module));
}

describe("startup bundle", () => {
  it("finds the modules it guards", () => {
    for (const module of [...HEAVY_MODULES, ...MOBILE_SHELL_MODULES]) {
      expect(existsSync(join(src, module))).toBe(true);
    }
  });

  it("keeps the mail renderer, compose UI and upgrade modals out of the entry", () => {
    expect(reached("main.tsx", HEAVY_MODULES)).toEqual([]);
  });

  it.each([
    "contexts/preferences_context/use_preferences_core.ts",
    "contexts/auth/auth_helpers.ts",
    "hooks/use_email_list.ts",
    "services/send_queue.ts",
    "services/mail_actions.ts",
    "services/forward_attachments.ts",
  ])("%s does not load the mail renderer or compose UI", (entry) => {
    expect(reached(entry, RENDERER_AND_UI_MODULES)).toEqual([]);
  });

  it.each(["App.tsx", "pages/index.tsx"])(
    "%s does not load the mobile shell",
    (entry) => {
      expect(reached(entry, MOBILE_SHELL_MODULES)).toEqual([]);
    },
  );
});
