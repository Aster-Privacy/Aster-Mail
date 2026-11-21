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
  PROVIDER_SIGN_IN_HOSTS,
  checked_provider_sign_in_url,
} from "@/lib/provider_sign_in_url";
import { INVOICE_PDF_HOSTS, checked_invoice_pdf_url } from "@/lib/payment_url";

const google_url = "https://accounts.google.com/o/oauth2/v2/auth";

describe("checked_provider_sign_in_url", () => {
  it("knows each connect provider", () => {
    expect([...PROVIDER_SIGN_IN_HOSTS.keys()].sort()).toEqual([
      "google",
      "microsoft",
      "yahoo",
    ]);
  });

  it("refuses an unknown provider", () => {
    expect(checked_provider_sign_in_url("constructor", google_url)).toBeNull();
    expect(checked_provider_sign_in_url("other", google_url)).toBeNull();
  });

  it("matches the host exactly regardless of case", () => {
    expect(
      checked_provider_sign_in_url(
        "google",
        "https://ACCOUNTS.GOOGLE.COM/o/oauth2/v2/auth?state=s",
      )?.toString(),
    ).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=s");
    expect(
      checked_provider_sign_in_url(
        "google",
        "https://accounts.google.com./o/oauth2/v2/auth",
      ),
    ).toBeNull();
    expect(checked_provider_sign_in_url("google", undefined)).toBeNull();
  });
});

describe("checked_invoice_pdf_url", () => {
  it("accepts only the Stripe invoice hosts", () => {
    expect([...INVOICE_PDF_HOSTS].sort()).toEqual([
      "invoice.stripe.com",
      "pay.stripe.com",
    ]);
    expect(checked_invoice_pdf_url(null)).toBeNull();
    expect(
      checked_invoice_pdf_url("https://PAY.STRIPE.COM/invoice/acct_1a/pdf"),
    ).toBe("https://pay.stripe.com/invoice/acct_1a/pdf");
    expect(
      checked_invoice_pdf_url("https://billing.stripe.com/p/session/x"),
    ).toBeNull();
  });
});
