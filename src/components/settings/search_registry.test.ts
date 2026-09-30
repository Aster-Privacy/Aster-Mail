import { describe, it, expect } from "vitest";

import { SETTINGS_SEARCH_REGISTRY } from "./search_registry";

import { en } from "@/lib/i18n/translations/en";

function resolve(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc as Record<string, unknown>)?.[part],
      en as unknown,
    );
}

describe("settings search registry", () => {
  it("resolves every label_key to the label it replaces", () => {
    const mismatched: string[] = [];

    for (const entry of SETTINGS_SEARCH_REGISTRY) {
      if (!entry.label_key) continue;
      const value = resolve(entry.label_key);

      if (value !== entry.label) {
        mismatched.push(`${entry.label_key}: ${String(value)}`);
      }
    }

    expect(mismatched).toEqual([]);
  });

  it("resolves every crumb_key to the breadcrumb tail it replaces", () => {
    const mismatched: string[] = [];

    for (const entry of SETTINGS_SEARCH_REGISTRY) {
      if (!entry.crumb_key) continue;
      const tail = entry.breadcrumb.split(" > ").slice(1).join(" > ");
      const value = resolve(entry.crumb_key);

      if (value !== tail) {
        mismatched.push(`${entry.crumb_key}: ${String(value)} != ${tail}`);
      }
    }

    expect(mismatched).toEqual([]);
  });

  it("gives every entry a translation key for its label and breadcrumb tail", () => {
    const untranslated: string[] = [];

    for (const entry of SETTINGS_SEARCH_REGISTRY) {
      if (!entry.label_key) untranslated.push(`label: ${entry.label}`);
      const tail = entry.breadcrumb.split(" > ").slice(1).join(" > ");

      if (tail && !entry.crumb_key) untranslated.push(`crumb: ${tail}`);
    }

    expect(untranslated).toEqual([]);
  });
});
