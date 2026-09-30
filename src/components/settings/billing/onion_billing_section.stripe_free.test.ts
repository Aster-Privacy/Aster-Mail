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
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const src_root = resolve(__dirname, "../../..");
const entry = resolve(__dirname, "onion_billing_section.tsx");
const extensions = [".ts", ".tsx", ".js", ".jsx"];

function resolve_specifier(specifier: string, from: string): string | null {
  if (specifier.startsWith("@/")) {
    return resolve_file(resolve(src_root, specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return resolve_file(resolve(dirname(from), specifier));
  }

  return null;
}

function resolve_file(base: string): string | null {
  for (const extension of extensions) {
    const candidate = `${base}${extension}`;

    if (existsSync(candidate)) return candidate;
  }
  for (const extension of extensions) {
    const candidate = resolve(base, `index${extension}`);

    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function collect_specifiers(source: string): string[] {
  const pattern = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  const found: string[] = [];
  let match = pattern.exec(source);

  while (match) {
    found.push(match[1]);
    match = pattern.exec(source);
  }

  return found;
}

function walk_graph(start: string): { files: string[]; packages: string[] } {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const file = queue.pop() as string;

    if (seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, "utf8");

    for (const specifier of collect_specifiers(source)) {
      const resolved = resolve_specifier(specifier, file);

      if (resolved) {
        queue.push(resolved);
      } else if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
        packages.add(specifier);
      }
    }
  }

  return { files: [...seen], packages: [...packages] };
}

describe("onion billing section", () => {
  const graph = walk_graph(entry);

  it("never reaches the stripe browser library", () => {
    expect(graph.packages).not.toContain("@stripe/stripe-js");
  });

  it("never reaches the modules that import the stripe browser library", () => {
    const forbidden = [
      "settings/billing_section.tsx",
      "settings/payment_methods_modal.tsx",
    ];

    const normalized = graph.files.map((file) => file.split("\\").join("/"));

    for (const name of forbidden) {
      expect(normalized.some((file) => file.endsWith(name))).toBe(false);
    }
  });

  it("walks a real graph", () => {
    expect(graph.files.length).toBeGreaterThan(10);
  });
});
