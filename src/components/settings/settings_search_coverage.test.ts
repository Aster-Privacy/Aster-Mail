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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { SETTINGS_SEARCH_REGISTRY } from "@/components/settings/search_registry";

const SCANNED_DIRS = ["src/components/settings", "src/pages/mobile/settings"];

const ROW_COMPONENTS = [
  "ToggleSetting",
  "SelectSetting",
  "SettingToggleRow",
  "SettingControlRow",
  "SettingRow",
  "SettingsRow",
  "IslandRow",
  "IslandSection",
  "SettingsGroup",
  "PrefRow",
  "TextFieldRow",
  "BillingMoreRow",
  "PanelRow",
];

const TITLE_ATTRIBUTES = ["title", "label", "heading"];

const NOT_SETTINGS = new Set([
  "common.more",
  "common.remove",
  "common.resend",
  "settings.reset",
  "settings.billing_see_all_features",
  "settings.crypto_renew_link",
  "settings.fam_kids_reserve_btn",
  "settings.fam_org_groups_add_member",
  "settings.fam_org_groups_delete",
  "settings.ghost_alias_active",
  "settings.ghost_alias_expired_grace",
  "settings.family_invite_pending",
  "settings.your_signatures",
  "settings.your_templates",
  "settings.desktop_bridge_set_up",
  "settings.signature_placement_description",
  "shared_mailboxes.open",
  "shared_mailboxes.delete_confirm_title",
]);

const DIRECT_KEY = /^\{\s*t\(\s*"([^"]+)"\s*(?:,[\s\S]*)?\)\s*\}$/;

function list_sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) list_sources(path, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(path);
  }

  return out;
}

function skip_braces(src: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let i = start; i < src.length; i++) {
    const char = src[i];

    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return src.length;
}

function read_attributes(src: string, start: number): Map<string, string> {
  const attributes = new Map<string, string>();
  let i = start;

  while (i < src.length) {
    while (/\s/.test(src[i] ?? "")) i++;
    if (src[i] === ">" || (src[i] === "/" && src[i + 1] === ">")) break;

    const name = /^[A-Za-z_][\w-]*/.exec(src.slice(i, i + 80))?.[0];

    if (!name) {
      i = src[i] === "{" ? skip_braces(src, i) : i + 1;
      continue;
    }
    i += name.length;
    if (src[i] !== "=") continue;
    i++;
    if (src[i] === '"' || src[i] === "'") {
      const end = src.indexOf(src[i], i + 1);

      attributes.set(name, src.slice(i, end + 1));
      i = end + 1;
    } else if (src[i] === "{") {
      const end = skip_braces(src, i);

      attributes.set(name, src.slice(i, end));
      i = end;
    }
  }

  return attributes;
}

function rendered_title_keys(): Map<string, string> {
  const keys = new Map<string, string>();
  const tag = new RegExp(`<(${ROW_COMPONENTS.join("|")})\\b`, "g");

  for (const dir of SCANNED_DIRS) {
    for (const file of list_sources(join(process.cwd(), dir))) {
      const src = readFileSync(file, "utf8");

      for (const match of src.matchAll(tag)) {
        const attributes = read_attributes(
          src,
          (match.index ?? 0) + match[0].length,
        );

        for (const attribute of TITLE_ATTRIBUTES) {
          const key = DIRECT_KEY.exec(attributes.get(attribute) ?? "")?.[1];

          if (key) {
            if (!keys.has(key)) {
              keys.set(key, relative(process.cwd(), file).split(sep).join("/"));
            }
            break;
          }
        }
      }
    }
  }

  return keys;
}

describe("settings search coverage", () => {
  const rendered = rendered_title_keys();
  const indexed = new Set(SETTINGS_SEARCH_REGISTRY.map((e) => e.label_key));

  it("finds the settings rows it scans", () => {
    expect(rendered.size).toBeGreaterThan(300);
    expect(rendered.has("settings.sender_logos")).toBe(true);
  });

  it("indexes every titled setting row and section", () => {
    const missing = [...rendered]
      .filter(([key]) => !indexed.has(key) && !NOT_SETTINGS.has(key))
      .map(([key, file]) => `${key} (${file})`);

    expect(missing).toEqual([]);
  });

  it("keeps the exemption list current", () => {
    const stale = [...NOT_SETTINGS].filter(
      (key) => !rendered.has(key) || indexed.has(key),
    );

    expect(stale).toEqual([]);
  });
});
