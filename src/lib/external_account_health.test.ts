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
import { describe, expect, it } from "vitest";

import {
  EXTERNAL_ACCOUNT_ALERT_AFTER_MS,
  build_alert_signature,
  classify_external_account,
  get_external_account_alerts,
  get_external_account_state,
  parse_timestamp,
  type ExternalAccountHealthInput,
  type ExternalAccountHealthRecord,
} from "@/lib/external_account_health";

const NOW = Date.parse("2026-10-25T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function account(
  overrides: Partial<ExternalAccountHealthInput> = {},
): ExternalAccountHealthInput {
  return {
    is_enabled: true,
    needs_reauth: false,
    last_sync_at: iso(NOW - HOUR),
    last_sync_status: "success",
    created_at: iso(NOW - 30 * 24 * HOUR),
    ...overrides,
  };
}

function record(
  id: string,
  overrides: Partial<ExternalAccountHealthRecord> = {},
): ExternalAccountHealthRecord {
  return {
    ...account(),
    id,
    email: `${id}@example.org`,
    protocol: "imap",
    problem_since: null,
    ...overrides,
  };
}

describe("parse_timestamp", () => {
  it("returns null for missing or malformed values", () => {
    expect(parse_timestamp(null)).toBeNull();
    expect(parse_timestamp(undefined)).toBeNull();
    expect(parse_timestamp("")).toBeNull();
    expect(parse_timestamp("not a date")).toBeNull();
  });

  it("parses an ISO timestamp", () => {
    expect(parse_timestamp(iso(NOW))).toBe(NOW);
  });
});

describe("get_external_account_state", () => {
  it("reports a healthy account that synced", () => {
    expect(get_external_account_state(account())).toBe("healthy");
  });

  it("reports an account that never synced", () => {
    expect(
      get_external_account_state(
        account({ last_sync_at: null, last_sync_status: null }),
      ),
    ).toBe("never_synced");
  });

  it("treats an unparseable sync time as never synced", () => {
    expect(
      get_external_account_state(account({ last_sync_at: "garbage" })),
    ).toBe("never_synced");
  });

  it("puts re-authentication ahead of the sync status", () => {
    expect(
      get_external_account_state(
        account({ needs_reauth: true, last_sync_status: "error" }),
      ),
    ).toBe("needs_reauth");
  });

  it("reports a paused account as paused", () => {
    expect(
      get_external_account_state(
        account({ is_enabled: false, last_sync_status: "error" }),
      ),
    ).toBe("paused");
  });

  it("reports sign-in needed on a paused account like the account card", () => {
    expect(
      get_external_account_state(
        account({ is_enabled: false, needs_reauth: true }),
      ),
    ).toBe("needs_reauth");
  });

  it("recognises both failure spellings", () => {
    expect(
      get_external_account_state(account({ last_sync_status: "error" })),
    ).toBe("failing");
    expect(
      get_external_account_state(account({ last_sync_status: "failed" })),
    ).toBe("failing");
  });

  it("counts a sync stopped by the storage quota as failing", () => {
    expect(
      get_external_account_state(
        account({ last_sync_status: "quota_exceeded" }),
      ),
    ).toBe("failing");
  });

  it("reports a running sync", () => {
    expect(
      get_external_account_state(account({ last_sync_status: "syncing" })),
    ).toBe("syncing");
    expect(
      get_external_account_state(account({ last_sync_status: "pending" })),
    ).toBe("syncing");
    expect(
      get_external_account_state(account({ last_sync_status: "purging" })),
    ).toBe("syncing");
  });
});

describe("classify_external_account", () => {
  it("asks for attention as soon as re-authentication is needed", () => {
    const result = classify_external_account(
      account({ needs_reauth: true, last_sync_at: iso(NOW - 5 * 60 * 1000) }),
      NOW,
    );

    expect(result.state).toBe("needs_reauth");
    expect(result.needs_attention).toBe(true);
  });

  it("does not ask for attention for a paused account that needs sign-in", () => {
    const result = classify_external_account(
      account({ is_enabled: false, needs_reauth: true }),
      NOW,
    );

    expect(result.state).toBe("needs_reauth");
    expect(result.needs_attention).toBe(false);
  });

  it("stays quiet for a failure younger than the threshold", () => {
    const result = classify_external_account(
      account({
        last_sync_status: "error",
        last_sync_at: iso(NOW - EXTERNAL_ACCOUNT_ALERT_AFTER_MS + 1),
      }),
      NOW,
    );

    expect(result.state).toBe("failing");
    expect(result.needs_attention).toBe(false);
  });

  it("asks for attention once the failure reaches the threshold", () => {
    const result = classify_external_account(
      account({
        last_sync_status: "error",
        last_sync_at: iso(NOW - EXTERNAL_ACCOUNT_ALERT_AFTER_MS),
      }),
      NOW,
    );

    expect(result.failing_since).toBe(NOW - EXTERNAL_ACCOUNT_ALERT_AFTER_MS);
    expect(result.needs_attention).toBe(true);
  });

  it("uses the earliest time the failure was seen on this device", () => {
    const result = classify_external_account(
      account({ last_sync_status: "error", last_sync_at: iso(NOW - HOUR) }),
      NOW,
      NOW - 25 * HOUR,
    );

    expect(result.failing_since).toBe(NOW - 25 * HOUR);
    expect(result.needs_attention).toBe(true);
  });

  it("falls back to the creation time when it never synced", () => {
    const result = classify_external_account(
      account({
        last_sync_status: "error",
        last_sync_at: null,
        created_at: iso(NOW - 2 * 24 * HOUR),
      }),
      NOW,
    );

    expect(result.failing_since).toBe(NOW - 2 * 24 * HOUR);
    expect(result.needs_attention).toBe(true);
  });

  it("stays quiet when no failure time is known", () => {
    const result = classify_external_account(
      account({
        last_sync_status: "error",
        last_sync_at: null,
        created_at: null,
      }),
      NOW,
    );

    expect(result.failing_since).toBeNull();
    expect(result.needs_attention).toBe(false);
  });

  it("does not alert for a sync time in the future", () => {
    const result = classify_external_account(
      account({
        last_sync_status: "error",
        last_sync_at: iso(NOW + 3 * 24 * HOUR),
      }),
      NOW,
    );

    expect(result.needs_attention).toBe(false);
  });

  it("does not alert when the clock is not a finite number", () => {
    const result = classify_external_account(
      account({
        last_sync_status: "error",
        last_sync_at: iso(NOW - 3 * 24 * HOUR),
      }),
      Number.NaN,
    );

    expect(result.needs_attention).toBe(false);
  });

  it("never alerts for paused, healthy, syncing or never-synced accounts", () => {
    const old = iso(NOW - 30 * 24 * HOUR);

    for (const input of [
      account({ is_enabled: false, last_sync_status: "error" }),
      account({ last_sync_at: old }),
      account({ last_sync_status: "syncing", last_sync_at: old }),
      account({ last_sync_at: null, last_sync_status: null }),
    ]) {
      expect(classify_external_account(input, NOW).needs_attention).toBe(false);
    }
  });
});

describe("get_external_account_alerts", () => {
  it("lists only accounts that need attention", () => {
    const alerts = get_external_account_alerts(
      [
        record("ok"),
        record("reauth", { needs_reauth: true, problem_since: NOW }),
        record("young", { last_sync_status: "error", problem_since: NOW }),
        record("old", {
          last_sync_status: "error",
          last_sync_at: iso(NOW - 2 * 24 * HOUR),
        }),
      ],
      NOW,
    );

    expect(alerts.map((alert) => [alert.record.id, alert.state])).toEqual([
      ["reauth", "needs_reauth"],
      ["old", "failing"],
    ]);
  });
});

describe("build_alert_signature", () => {
  it("does not depend on account order", () => {
    const a = record("a", { needs_reauth: true, problem_since: 1 });
    const b = record("b", { needs_reauth: true, problem_since: 2 });

    expect(
      build_alert_signature([
        { record: a, state: "needs_reauth" },
        { record: b, state: "needs_reauth" },
      ]),
    ).toBe(
      build_alert_signature([
        { record: b, state: "needs_reauth" },
        { record: a, state: "needs_reauth" },
      ]),
    );
  });

  it("ignores when this device first saw the problem", () => {
    const first = record("a", { needs_reauth: true, problem_since: 1 });
    const again = record("a", { needs_reauth: true, problem_since: 5 });

    expect(
      build_alert_signature([{ record: first, state: "needs_reauth" }]),
    ).toBe(build_alert_signature([{ record: again, state: "needs_reauth" }]));
  });

  it("changes when another account or state is involved", () => {
    const a = record("a", { needs_reauth: true });
    const b = record("b", { last_sync_status: "error" });
    const only_a = build_alert_signature([
      { record: a, state: "needs_reauth" },
    ]);

    expect(only_a).not.toBe(
      build_alert_signature([
        { record: a, state: "needs_reauth" },
        { record: b, state: "failing" },
      ]),
    );
    expect(only_a).not.toBe(
      build_alert_signature([{ record: a, state: "failing" }]),
    );
  });

  it("is empty without alerts", () => {
    expect(build_alert_signature([])).toBe("");
  });
});
