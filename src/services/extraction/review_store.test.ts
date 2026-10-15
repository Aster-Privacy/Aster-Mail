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
import type { ExtractedPurchaseDetails } from "./types";

import { beforeEach, describe, expect, it } from "vitest";

import {
  REVIEW_STORE_KEY,
  apply_receipt_review,
  confirm_receipt,
  get_sender_merchant,
  hide_receipt,
  sanitize_review_text,
  save_receipt_correction,
} from "./review_store";

const details: ExtractedPurchaseDetails = {
  document_kind: "receipt",
  merchant_source: "receipts@stripe.com",
  order_id: "1856-2392",
  order_date: "October 15, 2026",
  merchant_name: "JKatt",
  items: [],
  subtotal: null,
  tax: null,
  shipping_cost: null,
  discount: null,
  total: null,
  payment_method: null,
  card_last_four: null,
  billing_address: null,
  confirmation_number: null,
  transaction_id: null,
  raw_signals: [],
};

beforeEach(() => {
  localStorage.clear();
});

describe("review_store", () => {
  it("applies a saved correction to the same email", () => {
    save_receipt_correction("m1", details.merchant_source, {
      merchant_name: "Aster Privacy",
      order_id: "1856-2392",
    });

    const applied = apply_receipt_review(details, "m1");

    expect(applied.details.merchant_name).toBe("Aster Privacy");
    expect(applied.review?.confirmed).toBe(false);
  });

  it("remembers the merchant for later mail from the same sender", () => {
    save_receipt_correction("m1", "Receipts@Stripe.com", {
      merchant_name: "Aster Privacy",
      order_id: null,
    });

    const applied = apply_receipt_review(details, "m2");

    expect(applied.details.merchant_name).toBe("Aster Privacy");
    expect(applied.merchant_from_memory).toBe(true);
    expect(get_sender_merchant("receipts@stripe.com")).toBe("Aster Privacy");
  });

  it("strips markup and control characters from corrections", () => {
    expect(sanitize_review_text("  <b>Acme</b>\u0007  Co  ")).toBe("bAcme/b Co");
    expect(sanitize_review_text("x".repeat(200))?.length).toBe(80);
    expect(sanitize_review_text("   ")).toBeNull();
    expect(sanitize_review_text(42)).toBeNull();
  });

  it("ignores a tampered store", () => {
    localStorage.setItem(
      REVIEW_STORE_KEY,
      JSON.stringify({
        emails: { m1: { merchant_name: ["nope"], hidden: "yes" } },
        senders: { "receipts@stripe.com": { merchant_name: 7 } },
      }),
    );

    const applied = apply_receipt_review(details, "m1");

    expect(applied.details.merchant_name).toBe("JKatt");
    expect(applied.review?.hidden).toBe(false);
    expect(get_sender_merchant("receipts@stripe.com")).toBeNull();
  });

  it("tracks confirmed and hidden state per email", () => {
    confirm_receipt("m1");
    hide_receipt("m2");

    expect(apply_receipt_review(details, "m1").review?.confirmed).toBe(true);
    expect(apply_receipt_review(details, "m2").review?.hidden).toBe(true);
    expect(apply_receipt_review(details, "m3").review).toBeNull();
  });

  it("keeps the newest entries when the store is full", () => {
    for (let index = 0; index < 320; index += 1) {
      confirm_receipt(`m${index}`);
    }

    const raw = JSON.parse(localStorage.getItem(REVIEW_STORE_KEY) ?? "{}");

    expect(Object.keys(raw.emails).length).toBeLessThanOrEqual(300);
    expect(raw.emails.m319).toBeDefined();
  });
});
