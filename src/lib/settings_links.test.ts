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
import type { SettingsTarget } from "./settings_links";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, vi, afterEach } from "vitest";

import {
  open_settings_target,
  read_settings_navigation,
  SECURITY_CENTER_TARGETS,
  SETTINGS_ANCHORS,
} from "./settings_links";
import { SECURITY_CRITERION_TARGETS } from "./security_criteria";

import {
  resolve_settings_section,
  SETTINGS_SECTION_IDS,
} from "@/components/settings/settings_content_helpers";

const SECTION_SOURCES: Record<string, string[]> = {
  security: [
    "src/components/settings/security_section.tsx",
    "src/components/settings/security/account_recovery_section.tsx",
  ],
  account: ["src/components/settings/account_section.tsx"],
};

function read_source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

function rendered_sections(): string[] {
  const source = read_source("src/components/settings/settings_content.tsx");

  return Array.from(source.matchAll(/case "([a-z_]+)":/g)).map(
    (match) => match[1],
  );
}

function anchor_key(anchor: string): string | undefined {
  return Object.entries(SETTINGS_ANCHORS).find(
    ([, value]) => value === anchor,
  )?.[0];
}

const ALL_TARGETS: [string, SettingsTarget][] = [
  ...Object.entries(SECURITY_CENTER_TARGETS).map(
    ([id, target]): [string, SettingsTarget] => [`center:${id}`, target],
  ),
  ...Object.entries(SECURITY_CRITERION_TARGETS).map(
    ([id, target]): [string, SettingsTarget] => [`criterion:${id}`, target],
  ),
];

describe("security center settings links", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(ALL_TARGETS)(
    "%s opens a section the settings page renders",
    (_, target) => {
      expect(SETTINGS_SECTION_IDS).toContain(target.section);
      expect(resolve_settings_section(target.section)).toBe(target.section);
      expect(rendered_sections()).toContain(target.section);
    },
  );

  it.each(ALL_TARGETS.filter(([, target]) => target.anchor))(
    "%s scrolls to an anchor its section renders",
    (_, target) => {
      const key = anchor_key(target.anchor as string);
      const sources = SECTION_SOURCES[target.section] ?? [];
      const hosts = sources.filter((path) =>
        read_source(path).includes(`id={SETTINGS_ANCHORS.${key}}`),
      );

      expect(key).toBeDefined();
      expect(hosts).toHaveLength(1);
    },
  );

  it("keeps every anchor id unique", () => {
    const values = Object.values(SETTINGS_ANCHORS);

    expect(new Set(values).size).toBe(values.length);
  });

  it("sends login alerts and trusted devices to their own panels", () => {
    expect(SECURITY_CRITERION_TARGETS.login_alerts).toEqual({
      section: "security",
      anchor: SETTINGS_ANCHORS.login_alerts,
    });
    expect(SECURITY_CRITERION_TARGETS.login_alerts.anchor).not.toBe(
      SECURITY_CRITERION_TARGETS.two_factor.anchor,
    );
    expect(SECURITY_CENTER_TARGETS.trusted_devices).toEqual({
      section: "security",
      anchor: SETTINGS_ANCHORS.trusted_devices,
    });
  });

  it("reads string and object navigation details", () => {
    expect(read_settings_navigation("billing")).toEqual({
      section: "billing",
    });
    expect(
      read_settings_navigation({ section: "security", anchor: "sec-2fa" }),
    ).toEqual({ section: "security", anchor: "sec-2fa" });
    expect(read_settings_navigation({ section: 4, anchor: "" })).toEqual({
      section: undefined,
      anchor: undefined,
    });
    expect(read_settings_navigation(null)).toEqual({});
    expect(read_settings_navigation("")).toEqual({});
  });

  it("dispatches the target as a navigate-settings event", () => {
    const details: unknown[] = [];
    const listener = (event: Event) =>
      details.push((event as CustomEvent).detail);

    window.addEventListener("navigate-settings", listener);
    open_settings_target(SECURITY_CENTER_TARGETS.sessions);
    open_settings_target(SECURITY_CENTER_TARGETS.encryption);
    window.removeEventListener("navigate-settings", listener);

    expect(details).toEqual([
      { section: "security", anchor: "sec-sessions" },
      "encryption",
    ]);
  });
});
