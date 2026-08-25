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

import { describe_send_refusal } from "./send_refusal";

import { en } from "@/lib/i18n/translations/en";

const in_an_hour = new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe("describe_send_refusal", () => {
  it("tells a concentration refusal apart from an ordinary daily limit", () => {
    const refusal = describe_send_refusal({
      code: "RATE_LIMIT_EXCEEDED",
      server_code: "RECIPIENT_CONCENTRATION",
      resets_at: in_an_hour,
      details: { domain: "example.net" },
    });

    expect(refusal?.message).toContain("example.net");
    expect(refusal?.message).not.toBe(en.errors.daily_limit_reached);
  });

  it("names the recipient cap so the sender knows what to change", () => {
    const refusal = describe_send_refusal({
      code: "VALIDATION_ERROR",
      server_code: "TOO_MANY_RECIPIENTS",
      details: { max_allowed: 25 },
    });

    expect(refusal?.kind).toBe("send_failed");
    expect(refusal?.message).toContain("25");
  });

  it("states the attachment size cap in units the sender reads", () => {
    const refusal = describe_send_refusal({
      code: "VALIDATION_ERROR",
      server_code: "ATTACHMENTS_TOO_LARGE",
      details: { max_bytes: 26214400 },
    });

    expect(refusal?.kind).toBe("send_failed");
    expect(refusal?.message).toContain("25 MB");
    expect(refusal?.message).not.toContain("26214400");
  });

  it("names the attachment count cap", () => {
    const refusal = describe_send_refusal({
      code: "VALIDATION_ERROR",
      server_code: "TOO_MANY_ATTACHMENTS",
      details: { max_allowed: 50 },
    });

    expect(refusal?.kind).toBe("send_failed");
    expect(refusal?.message).toContain("50");
  });

  it("falls back to a neutral phrase when the server names no domain", () => {
    const refusal = describe_send_refusal({
      server_code: "RECIPIENT_CONCENTRATION",
      resets_at: in_an_hour,
    });

    expect(refusal?.message).toContain(en.errors.that_provider);
    expect(refusal?.message).not.toContain("{{domain}}");
  });

  it("still handles a plain daily limit", () => {
    const refusal = describe_send_refusal({
      code: "RATE_LIMIT_EXCEEDED",
      resets_at: in_an_hour,
    });

    expect(refusal?.kind).toBe("rate_limited");
    expect(refusal?.message).not.toContain("{{time}}");
  });

  it("leaves an unrelated failure to the caller", () => {
    expect(describe_send_refusal({ code: "SERVER_ERROR" })).toBeNull();
  });

  it("leaves no placeholder unfilled in any refusal it produces", () => {
    const cases = [
      { code: "RATE_LIMIT_EXCEEDED", resets_at: in_an_hour },
      {
        server_code: "RECIPIENT_CONCENTRATION",
        resets_at: in_an_hour,
        details: { domain: "example.net" },
      },
      { server_code: "TOO_MANY_RECIPIENTS", details: { max_allowed: 250 } },
      { server_code: "ATTACHMENTS_TOO_LARGE", details: { max_bytes: 52428800 } },
      { server_code: "TOO_MANY_ATTACHMENTS", details: { max_allowed: 50 } },
    ];

    for (const source of cases) {
      const refusal = describe_send_refusal(source);

      expect(refusal).not.toBeNull();
      expect(refusal?.message).not.toMatch(/\{\{[a-z_]+\}\}/);
    }
  });
});
