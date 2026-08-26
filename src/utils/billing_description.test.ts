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

import {
  describe_billing_entry,
  describe_credit_entry,
} from "./billing_description";
import { en } from "@/lib/i18n/translations/en";

function translate(
  key: string,
  params?: Record<string, string | number>,
): string {
  const [group, name] = key.split(".");
  const raw = (en as unknown as Record<string, Record<string, string>>)[group][
    name
  ];

  if (!params) return raw;

  return Object.entries(params).reduce(
    (result, [param, value]) =>
      result.replace(new RegExp(`\{\{\s*${param}\s*\}\}`, "g"), String(value)),
    raw,
  );
}

const t = translate as never;

describe("describe_billing_entry", () => {
  it("translates the server payment failure text", () => {
    expect(describe_billing_entry("Payment failed", t)).toBe(
      en.settings.billing_desc_payment_failed,
    );
  });

  it("translates a refund", () => {
    expect(describe_billing_entry("Refund processed", t)).toBe(
      en.settings.billing_desc_refund_processed,
    );
  });

  it("keeps the dispute reason", () => {
    expect(describe_billing_entry("Payment disputed: fraudulent", t)).toContain(
      "fraudulent",
    );
  });

  it("breaks a crypto payment into its parts", () => {
    expect(
      describe_billing_entry("Crypto payment (btc on bitcoin) - plus 12mo", t),
    ).toBe("plus, 12-month term, paid with BTC on bitcoin");
  });

  it("distinguishes a manual crypto credit", () => {
    expect(
      describe_billing_entry(
        "Crypto manual credit (eth on ethereum) - pro 1mo",
        t,
      ),
    ).toBe("pro, 1-month term, credited in ETH on ethereum");
  });

  it("passes an unknown description through unchanged", () => {
    expect(describe_billing_entry("Aster Plus x 1", t)).toBe("Aster Plus x 1");
  });

  it("returns an empty string when there is no description", () => {
    expect(describe_billing_entry(null, t)).toBe("");
    expect(describe_billing_entry("   ", t)).toBe("");
  });
});

describe("describe_credit_entry", () => {
  it("localizes every fixed server description", () => {
    expect(describe_credit_entry("Applied to invoice", t)).toBe(
      en.settings.credit_desc_applied_invoice,
    );
    expect(describe_credit_entry("Credits reversed - invoice voided", t)).toBe(
      en.settings.credit_desc_reversed_invoice_voided,
    );
    expect(describe_credit_entry("Install bonus - desktop", t)).toBe(
      en.settings.credit_desc_install_bonus,
    );
  });

  it("keeps the purchased amount", () => {
    expect(describe_credit_entry("Purchased $12.34 in credits", t)).toBe(
      "Purchased $12.34 in credits",
    );
  });

  it("keeps the referral reversal reason", () => {
    expect(
      describe_credit_entry("Referral commission reversed - refunded", t),
    ).toBe("Referral commission reversed: refunded");
  });

  it("localizes a crypto overpayment credit", () => {
    expect(
      describe_credit_entry("Crypto overpayment credit (btc on bitcoin)", t),
    ).toBe("Crypto overpayment credit in BTC on bitcoin");
  });

  it("passes admin free text through unchanged", () => {
    expect(describe_credit_entry("Goodwill credit for outage", t)).toBe(
      "Goodwill credit for outage",
    );
    expect(describe_credit_entry(null, t)).toBe("");
  });
});
