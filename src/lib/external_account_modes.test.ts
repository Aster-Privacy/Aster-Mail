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
  account_mode,
  external_caps,
  external_sender_candidates,
  fetches_on_server,
  is_paused_by_plan,
  parse_external_limit_error,
  upgrade_resource_for,
  validate_send_only_draft,
  type SendOnlyDraft,
} from "./external_account_modes";

const good_draft: SendOnlyDraft = {
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_username: "me@example.com",
  smtp_password: "app-password",
  from_address: "me@example.com",
  from_name: "Me",
  password_required: true,
};

function sender(overrides: Record<string, unknown>) {
  return {
    email: "me@example.com",
    is_enabled: true,
    is_verified: true,
    oauth_provider: null as string | null,
    mode: "server_sync",
    paused_reason: null as string | null,
    ...overrides,
  };
}

describe("account_mode", () => {
  it("defaults unknown and missing modes to server sync", () => {
    expect(account_mode({})).toBe("server_sync");
    expect(account_mode({ mode: "bogus" })).toBe("server_sync");
    expect(account_mode({ mode: "send_only" })).toBe("send_only");
    expect(account_mode({ mode: "two_way" })).toBe("two_way");
  });

  it("only fetches for unpaused sync modes", () => {
    expect(fetches_on_server({ mode: "server_sync" })).toBe(true);
    expect(fetches_on_server({ mode: "two_way" })).toBe(true);
    expect(fetches_on_server({ mode: "send_only" })).toBe(false);
    expect(fetches_on_server({ mode: "device" })).toBe(false);
    expect(
      fetches_on_server({ mode: "server_sync", paused_reason: "plan_cap" }),
    ).toBe(false);
    expect(is_paused_by_plan({ paused_reason: "plan_cap" })).toBe(true);
  });
});

describe("external_caps", () => {
  it("counts each class against its own limit", () => {
    const caps = external_caps(
      {
        limits: {
          max_external_accounts: { limit: 1 },
          max_send_only_accounts: { limit: 2 },
          max_multi_accounts: { limit: 0 },
        },
      },
      [{ mode: "server_sync" }, { mode: "send_only" }],
    );

    expect(caps.fetching).toEqual({ limit: 1, used: 1, at_limit: true });
    expect(caps.send_only).toEqual({ limit: 2, used: 1, at_limit: false });
  });

  it("treats missing limits as unlimited and a disabled feature as full", () => {
    const open = external_caps({ limits: {} }, [{ mode: "server_sync" }]);

    expect(open.fetching.at_limit).toBe(false);
    expect(open.send_only.limit).toBe(-1);

    const closed = external_caps(
      { limits: { has_external_accounts: { limit: 0 } } },
      [],
    );

    expect(closed.enabled).toBe(false);
    expect(closed.fetching.at_limit).toBe(true);
    expect(closed.send_only.at_limit).toBe(true);
  });
});

describe("parse_external_limit_error", () => {
  it("reads both limit codes with their details", () => {
    expect(
      parse_external_limit_error({
        server_code: "SEND_ONLY_ACCOUNT_LIMIT",
        details: { limit: 1, used: 1 },
      }),
    ).toEqual({ cap_class: "send_only", limit: 1, used: 1 });
    expect(
      parse_external_limit_error({
        server_code: "EXTERNAL_ACCOUNT_LIMIT",
        details: { limit: "x" },
      }),
    ).toEqual({ cap_class: "fetching", limit: null, used: null });
    expect(parse_external_limit_error({ server_code: "OTHER" })).toBeNull();
  });

  it("maps classes to upgrade resources", () => {
    expect(upgrade_resource_for("send_only")).toBe("send-only accounts");
    expect(upgrade_resource_for("fetching")).toBe("external accounts");
  });
});

describe("external_sender_candidates", () => {
  it("offers send-only accounts and hides paused or disabled ones", () => {
    const accounts = [
      sender({ email: "a@example.com" }),
      sender({ email: "b@example.com", mode: "send_only" }),
      sender({ email: "c@example.com", mode: "send_only", is_verified: false }),
      sender({ email: "d@example.com", paused_reason: "plan_cap" }),
      sender({ email: "e@example.com", is_enabled: false }),
      sender({ email: "f@example.com", oauth_provider: "microsoft" }),
      sender({ email: "oauth-1@import" }),
    ];

    expect(external_sender_candidates(accounts).map((a) => a.email)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });
});

describe("validate_send_only_draft", () => {
  it("accepts a complete draft", () => {
    expect(validate_send_only_draft(good_draft)).toBeNull();
    expect(
      validate_send_only_draft({
        ...good_draft,
        smtp_password: "",
        password_required: false,
      }),
    ).toBeNull();
  });

  it("rejects each invalid field", () => {
    const cases: [Partial<SendOnlyDraft>, string][] = [
      [{ smtp_host: "localhost" }, "host"],
      [{ smtp_host: "bad host.com" }, "host"],
      [{ smtp_port: 25 }, "port"],
      [{ smtp_port: 99999 }, "port"],
      [{ smtp_username: "" }, "username"],
      [{ smtp_username: "a\r\nb" }, "username"],
      [{ smtp_password: "" }, "password"],
      [{ smtp_password: "x".repeat(513) }, "password"],
      [{ from_address: "not-an-address" }, "from_address"],
      [{ from_address: "a b@example.com" }, "from_address"],
      [{ from_name: "x".repeat(129) }, "from_name"],
      [{ from_name: "Me\nBcc: x@example.com" }, "from_name"],
    ];

    for (const [patch, field] of cases) {
      expect(validate_send_only_draft({ ...good_draft, ...patch })).toBe(
        field,
      );
    }
  });
});
