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
import type { DomainCheck, DomainHealth } from "@/services/api/domains";

import { describe, expect, it } from "vitest";

import {
  check_label_key,
  check_status_key,
  hero_copy,
  should_keep_polling,
  sort_checks,
} from "./domain_health";

import { en } from "@/lib/i18n/translations/en";

function health(overrides: Partial<DomainHealth> = {}): DomainHealth {
  return {
    domain_id: "d1",
    domain_name: "example.com",
    status: "active",
    health_status: "healthy",
    severity: "ok",
    receiving_mail: true,
    sending_trusted: true,
    checks: [],
    reasons: [],
    checked_at: "2026-08-03T12:00:00Z",
    cached: false,
    ...overrides,
  };
}

function lookup(key: string): string | undefined {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    ) as string | undefined;
}

describe("hero_copy", () => {
  it("leads with lost mail when delivery is broken", () => {
    const copy = hero_copy(health({ severity: "critical" }));

    expect(copy.tone).toBe("critical");
    expect(lookup(copy.title_key)).toBe("You are not receiving email");
  });

  it("says mail still works when only sending reputation is at risk", () => {
    const copy = hero_copy(health({ severity: "warning" }));

    expect(copy.tone).toBe("warning");
    expect(lookup(copy.title_key)).toContain("Mail works");
  });

  it("names the domain when everything passes", () => {
    const copy = hero_copy(health());

    expect(copy.tone).toBe("ok");
    expect(lookup(copy.title_key)).toContain("{{domain}}");
  });

  it("treats an unreadable resolver as unknown, never as broken", () => {
    const copy = hero_copy(
      health({ health_status: "unknown", severity: "critical" }),
    );

    expect(copy.tone).toBe("unknown");
    expect(lookup(copy.title_key)).toContain("could not read your DNS");
  });

  it("falls back to unknown when the request failed entirely", () => {
    expect(hero_copy(null).tone).toBe("unknown");
  });
});

describe("check_status_key", () => {
  const check = (over: Partial<DomainCheck>): DomainCheck => ({
    key: "mx",
    outcome: "fail",
    ...over,
  });

  it("maps every backend reason key to real copy", () => {
    const reasons = [
      "mx_missing",
      "mx_points_elsewhere",
      "spf_missing",
      "spf_missing_include",
      "spf_duplicate_records",
      "dkim_missing_or_stale",
      "dmarc_missing",
    ];

    for (const reason of reasons) {
      const key = check_status_key(check({ reason }));

      expect(key, reason).not.toBe("settings.domain_check_generic_failure");
      expect(lookup(key), reason).toBeTypeOf("string");
    }
  });

  it("falls back to generic copy for an unrecognised reason", () => {
    expect(check_status_key(check({ reason: "some_future_reason" }))).toBe(
      "settings.domain_check_generic_failure",
    );
  });

  it("uses pass copy when the check succeeds", () => {
    expect(
      check_status_key(
        check({ key: "dkim", outcome: "pass", reason: undefined }),
      ),
    ).toBe("settings.domain_check_dkim_pass");
  });

  it("does not claim failure when the outcome is unknown", () => {
    expect(check_status_key(check({ outcome: "unknown" }))).toBe(
      "settings.domain_check_unknown",
    );
  });
});

describe("check_label_key", () => {
  it("labels every check with an outcome, not an acronym", () => {
    for (const key of ["mx", "spf", "dkim", "dmarc"] as const) {
      const label = lookup(check_label_key(key));

      expect(label, key).toBeTypeOf("string");
      expect(label!.toUpperCase(), key).not.toBe(key.toUpperCase());
    }
  });
});

describe("sort_checks", () => {
  it("floats failing checks to the top and keeps a stable order below", () => {
    const checks: DomainCheck[] = [
      { key: "mx", outcome: "pass" },
      { key: "spf", outcome: "pass" },
      { key: "dkim", outcome: "fail", reason: "dkim_missing_or_stale" },
      { key: "dmarc", outcome: "unknown" },
    ];

    expect(sort_checks(checks).map((c) => c.key)).toEqual([
      "dkim",
      "mx",
      "spf",
      "dmarc",
    ]);
  });

  it("does not mutate the input", () => {
    const checks: DomainCheck[] = [
      { key: "spf", outcome: "pass" },
      { key: "mx", outcome: "fail" },
    ];

    sort_checks(checks);

    expect(checks.map((c) => c.key)).toEqual(["spf", "mx"]);
  });
});

describe("should_keep_polling", () => {
  it("keeps polling while anything is unresolved", () => {
    expect(should_keep_polling(health({ severity: "warning" }))).toBe(true);
    expect(should_keep_polling(health({ severity: "critical" }))).toBe(true);
    expect(should_keep_polling(null)).toBe(true);
  });

  it("stops once the domain is fully healthy", () => {
    expect(should_keep_polling(health({ severity: "ok" }))).toBe(false);
  });
});
