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
// Summary of the SPF, DKIM and DMARC results that Aster's mail servers record
// when a message arrives (the spf_result, dkim_result and dmarc_result fields
// of a message). Only those server-side results are used: an
// Authentication-Results header inside the message could have been written by
// the sender.

export type EmailAuthCheck = "spf" | "dkim" | "dmarc";

export type EmailAuthStatus = "pass" | "fail" | "none" | "missing" | "other";

export type EmailAuthVerdict =
  "authenticated" | "unverified" | "partial" | "failed";

export interface EmailAuthResults {
  spf_result?: string | null;
  dkim_result?: string | null;
  dmarc_result?: string | null;
}

export interface EmailAuthCheckResult {
  check: EmailAuthCheck;
  status: EmailAuthStatus;
  // Shown for "other" statuses: the server's value, upper-cased and capped.
  value: string;
}

export interface EmailAuthSummary {
  verdict: EmailAuthVerdict;
  checks: EmailAuthCheckResult[];
}

const MAX_SHOWN_VALUE = 32;

function normalize_status(raw: unknown): {
  status: EmailAuthStatus;
  value: string;
} {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!value || value === "missing") return { status: "missing", value: "" };
  if (value === "pass") return { status: "pass", value };
  if (value === "fail" || value === "hardfail") {
    return { status: "fail", value };
  }
  if (value === "none") return { status: "none", value };

  return {
    status: "other",
    value: Array.from(value.toUpperCase()).slice(0, MAX_SHOWN_VALUE).join(""),
  };
}

// Authenticated when DMARC passed on top of SPF or DKIM (the rule the
// Android app uses for an authenticated sender). Failed when a check failed
// and DMARC did not pass. Partial (inconclusive) when a check gave an
// unusual result (softfail, neutral, temperror...), or when DMARC passed
// without an SPF or DKIM pass: the server accepted the domain, for example
// through another DKIM signature, so a failed check alone does not make the
// message a spoof. Unverified when checks were simply absent, which is
// common for legitimate mail from domains without a DMARC policy. Null when
// the server recorded nothing.
export function summarize_email_authentication(
  results: EmailAuthResults,
): EmailAuthSummary | null {
  const spf = normalize_status(results.spf_result);
  const dkim = normalize_status(results.dkim_result);
  const dmarc = normalize_status(results.dmarc_result);
  const checks: EmailAuthCheckResult[] = [
    { check: "spf", ...spf },
    { check: "dkim", ...dkim },
    { check: "dmarc", ...dmarc },
  ];

  if (checks.every((check) => check.status === "missing")) return null;

  const has = (status: EmailAuthStatus) =>
    checks.some((check) => check.status === status);
  let verdict: EmailAuthVerdict = "unverified";

  if (
    dmarc.status === "pass" &&
    (spf.status === "pass" || dkim.status === "pass")
  ) {
    verdict = "authenticated";
  } else if (has("fail") && dmarc.status !== "pass") {
    verdict = "failed";
  } else if (has("other") || dmarc.status === "pass") {
    verdict = "partial";
  }

  return { verdict, checks };
}
