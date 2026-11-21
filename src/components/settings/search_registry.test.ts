import { describe, it, expect } from "vitest";

import { SETTINGS_SEARCH_REGISTRY, keyword_key } from "./search_registry";
import {
  is_settings_tab_available,
  resolve_nav_target,
} from "./settings_content_helpers";
import { lookup_in_table } from "./settings_search_index";

import { is_settings_section } from "@/lib/settings_section_names";
import { en } from "@/lib/i18n/translations/en";
import { resolve_mobile_section } from "@/pages/mobile/settings/section_routing";

const lookup = lookup_in_table(en);

describe("settings search registry", () => {
  it("gives every entry a unique id", () => {
    const ids = SETTINGS_SEARCH_REGISTRY.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every label, crumb, and description key in English", () => {
    const missing: string[] = [];

    for (const entry of SETTINGS_SEARCH_REGISTRY) {
      for (const key of [
        entry.label_key,
        entry.crumb_key,
        entry.description_key,
      ]) {
        if (key && !lookup(key)) missing.push(`${entry.id}: ${key}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("gives every entry translated search keywords", () => {
    const missing = SETTINGS_SEARCH_REGISTRY.filter(
      (entry) => !lookup(keyword_key(entry))?.trim(),
    ).map((entry) => entry.id);

    expect(missing).toEqual([]);
    expect(Object.keys(en.settings_keywords).sort()).toEqual(
      SETTINGS_SEARCH_REGISTRY.map((entry) => entry.id).sort(),
    );
  });

  it("routes every desktop entry to a real settings section", () => {
    const unroutable = SETTINGS_SEARCH_REGISTRY.filter(
      (entry) =>
        entry.platform !== "mobile" &&
        !is_settings_section(resolve_nav_target(entry.section).section),
    ).map((entry) => entry.id);

    expect(unroutable).toEqual([]);
  });

  it("routes every mobile entry to a mobile settings section", () => {
    const unroutable = SETTINGS_SEARCH_REGISTRY.filter(
      (entry) =>
        entry.platform === "mobile" && !resolve_mobile_section(entry.section),
    ).map((entry) => entry.id);

    expect(unroutable).toEqual([]);
  });

  it("opens the tab that holds each mail management result", () => {
    const target_of = (label: string) => {
      const entry = SETTINGS_SEARCH_REGISTRY.find(
        (candidate) =>
          candidate.platform !== "mobile" &&
          lookup(candidate.label_key) === label,
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
