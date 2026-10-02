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
  value: string;
}

export interface EmailAuthSummary {
  verdict: EmailAuthVerdict;
  checks: EmailAuthCheckResult[];
}

const MAX_SHOWN_VALUE = 32;

export function normalize_email_auth_status(raw: unknown): {
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

export function summarize_email_authentication(
  results: EmailAuthResults,
): EmailAuthSummary | null {
  const spf = normalize_email_auth_status(results.spf_result);
  const dkim = normalize_email_auth_status(results.dkim_result);
  const dmarc = normalize_email_auth_status(results.dmarc_result);
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
