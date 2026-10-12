import { describe, it, expect } from "vitest";

import { SETTINGS_SEARCH_REGISTRY } from "./search_registry";
import {
  is_settings_section,
  is_settings_tab_available,
  resolve_nav_target,
} from "./settings_content_helpers";

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

  it("routes every entry to a real settings section", () => {
    const unroutable = SETTINGS_SEARCH_REGISTRY.filter(
      (entry) => !is_settings_section(resolve_nav_target(entry.section).section),
    ).map((entry) => entry.label);

    expect(unroutable).toEqual([]);
  });

  it("opens the tab that holds each mail management result", () => {
    const target_of = (label: string) => {
      const entry = SETTINGS_SEARCH_REGISTRY.find(
        (candidate) => candidate.label === label,
      );

      return resolve_nav_target(entry?.section ?? "");
    };

    expect(target_of("Allowlist")).toEqual({
      section: "mail_rules",
      tab: "allowlist",
    });
    expect(target_of("Vacation Reply")).toEqual({
      section: "mail_rules",
      tab: "vacation_reply",
    });
    expect(target_of("Auto-Forward")).toEqual({
      section: "mail_rules",
      tab: "auto_forward",
    });
    expect(target_of("External Accounts")).toEqual({
      section: "import",
      tab: "external_accounts",
    });
    expect(target_of("Export emails")).toEqual({
      section: "import",
      tab: "export",
    });

    for (const label of [
      "Custom domain",
      "Buy a domain",
      "Verify All Records",
      "DNS records",
      "Catch-all",
    ]) {
      expect(target_of(label)).toEqual({ section: "domains" });
    }
  });

  it("hides results on tabs the account does not have", () => {
    const none = {
      show_developer: false,
      show_updates: false,
      is_family_plan: false,
      has_devices: false,
    };

    for (const tab of ["developer", "updates", "family", "trusted_devices"]) {
      expect(is_settings_tab_available(tab, none)).toBe(false);
    }
    expect(is_settings_tab_available("blocked", none)).toBe(true);
    expect(is_settings_tab_available(undefined, none)).toBe(true);
    expect(
      is_settings_tab_available("family", { ...none, is_family_plan: true }),
    ).toBe(true);
  });
});
