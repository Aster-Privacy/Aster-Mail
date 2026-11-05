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
  awaiting_code_addresses,
  forwarding_rule_state,
} from "@/components/settings/forwarding_destination_confirm";

const destination = (confirmed: boolean) => ({
  address: confirmed ? "kept@example.com" : "new@example.com",
  is_internal: false,
  confirmed,
  confirmation_sent_at: null,
});

describe("forwarding_rule_state", () => {
  it("is pending when every destination is unconfirmed", () => {
    expect(
      forwarding_rule_state({
        is_enabled: true,
        destinations: [destination(false)],
      }),
    ).toBe("pending");
  });

  it("is active when at least one destination is confirmed", () => {
    expect(
      forwarding_rule_state({
        is_enabled: true,
        destinations: [destination(true), destination(false)],
      }),
    ).toBe("active");
  });

  it("is active when the backend omits destinations", () => {
    expect(forwarding_rule_state({ is_enabled: true })).toBe("active");
    expect(forwarding_rule_state({ is_enabled: true, destinations: [] })).toBe(
      "active",
    );
  });

  it("is paused when the rule is disabled", () => {
    expect(
      forwarding_rule_state({
        is_enabled: false,
        destinations: [destination(false)],
      }),
    ).toBe("paused");
  });
});

describe("awaiting_code_addresses", () => {
  it("lists unconfirmed destinations whose code was sent", () => {
    expect(
      awaiting_code_addresses([destination(false), destination(true)]),
    ).toEqual(["new@example.com"]);
  });

  it("leaves out destinations whose confirmation email failed", () => {
    expect(
      awaiting_code_addresses([
        { ...destination(false), send_error: "send_failed" },
      ]),
    ).toEqual([]);
  });

  it("handles a rule with no destinations", () => {
    expect(awaiting_code_addresses(undefined)).toEqual([]);
  });
});
