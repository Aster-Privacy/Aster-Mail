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
import { describe, it, expect } from "vitest";

import { summarize_email_authentication } from "@/utils/email_authentication";

function verdict(spf?: string, dkim?: string, dmarc?: string) {
  return summarize_email_authentication({
    spf_result: spf,
    dkim_result: dkim,
    dmarc_result: dmarc,
  })?.verdict;
}

describe("summarize_email_authentication", () => {
  it("is authenticated when DMARC passes on top of SPF or DKIM", () => {
    expect(verdict("pass", "pass", "pass")).toBe("authenticated");
    expect(verdict("pass", "none", "pass")).toBe("authenticated");
    // Forwarded mail: SPF fails at the forwarder, DKIM still aligns.
    expect(verdict("fail", "pass", "pass")).toBe("authenticated");
  });

  it("fails when a check failed and DMARC did not pass", () => {
    expect(verdict("pass", "pass", "fail")).toBe("failed");
    expect(verdict("fail", "none", "none")).toBe("failed");
    expect(verdict(undefined, "fail", undefined)).toBe("failed");
    expect(verdict("fail", "none", "temperror")).toBe("failed");
  });

  it("is inconclusive for unusual results", () => {
    expect(verdict("softfail", "none", "none")).toBe("partial");
    expect(verdict("pass", "pass", "temperror")).toBe("partial");
    expect(verdict("none", "none", "pass")).toBe("partial");
  });

  it("does not call a message spoofed when DMARC passed", () => {
    // The server accepted the domain (another DKIM signature, for example),
    // even though the recorded SPF and DKIM results did not pass.
    expect(verdict("fail", "fail", "pass")).toBe("partial");
    expect(verdict("fail", "none", "pass")).toBe("partial");
    expect(verdict("none", "fail", "pass")).toBe("partial");
  });

  it("is not fully verified when checks are only absent", () => {
    expect(verdict("pass", "pass", "none")).toBe("unverified");
    expect(verdict("pass", undefined, undefined)).toBe("unverified");
    expect(verdict("none", "none", "none")).toBe("unverified");
  });

  it("shows nothing when the server recorded no result", () => {
    expect(summarize_email_authentication({})).toBeNull();
    expect(
      summarize_email_authentication({
        spf_result: " ",
        dkim_result: "MISSING",
        dmarc_result: null,
      }),
    ).toBeNull();
  });

  it("ignores values that are not text", () => {
    const summary = summarize_email_authentication({
      spf_result: 5 as unknown as string,
      dkim_result: {} as unknown as string,
      dmarc_result: "pass",
    });

    expect(summary?.checks.map((check) => check.status)).toEqual([
      "missing",
      "missing",
      "pass",
    ]);
    expect(summary?.verdict).toBe("partial");
  });

  it("normalises the values the server sends", () => {
    const summary = summarize_email_authentication({
      spf_result: " PASS ",
      dkim_result: "HardFail",
      dmarc_result: "TempError",
    });

    expect(summary?.checks).toEqual([
      { check: "spf", status: "pass", value: "pass" },
      { check: "dkim", status: "fail", value: "hardfail" },
      { check: "dmarc", status: "other", value: "TEMPERROR" },
    ]);
    expect(summary?.verdict).toBe("failed");
  });

  it("caps an unexpected value without splitting characters", () => {
    const summary = summarize_email_authentication({
      spf_result: "\u{1F600}".repeat(40),
    });

    expect(Array.from(summary!.checks[0].value)).toHaveLength(32);
    expect(summary!.checks[0].value).toBe("\u{1F600}".repeat(32));
  });
});
