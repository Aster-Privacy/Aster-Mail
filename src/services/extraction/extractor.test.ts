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
  extract_purchase_details,
  extract_shipping_details,
  is_purchase_email,
} from "./extractor";

describe("purchase order id accuracy", () => {
  it("does not read a plain word after order as an order number", () => {
    const result = extract_purchase_details(
      "Your Aster Privacy receipt",
      "Thanks for your order Download your invoice below. Total: $86.99.",
      "receipts@astermail.org",
      "Aster Privacy",
    );

    expect(result.order_id).toBeNull();
  });

  it("still reads a real order number", () => {
    const result = extract_purchase_details(
      "Your receipt",
      "Order #INV-90210 was placed. Total: $12.00.",
      "receipts@store.com",
      "Store",
    );

    expect(result.order_id).toBe("INV-90210");
  });

  it("reads a marketplace order number", () => {
    const result = extract_purchase_details(
      "Your order",
      "Order 112-1234567-1234567 confirmed. Total: $12.00.",
      "orders@store.com",
      "Store",
    );

    expect(result.order_id).toBe("112-1234567-1234567");
  });

  it("does not read a word after confirmation as a confirmation number", () => {
    const result = extract_purchase_details(
      "Your receipt",
      "Confirmation pending. Order #A1234 placed. Total: $12.00.",
      "receipts@store.com",
      "Store",
    );

    expect(result.confirmation_number).toBeNull();
  });
});

describe("purchase amount accuracy", () => {
  it("does not read the subtotal as the total", () => {
    const result = extract_purchase_details(
      "Purchase receipt",
      "Subtotal: $86.99\nDiscount: -$1.00\nTotal: $85.99",
      "receipts@astermail.org",
      "Aster Privacy",
    );

    expect(result.subtotal?.value).toBe(86.99);
    expect(result.discount?.value).toBe(1);
    expect(result.total?.value).toBe(85.99);
  });

  it("drops a discount that the total does not reflect", () => {
    const result = extract_purchase_details(
      "Purchase receipt",
      "Subtotal: $86.99\nMember savings: $1.00\nOrder total: $86.99",
      "receipts@astermail.org",
      "Aster Privacy",
    );

    expect(result.total?.value).toBe(86.99);
    expect(result.discount).toBeNull();
  });

  it("drops a breakdown whose parts exceed the total", () => {
    const result = extract_purchase_details(
      "Purchase receipt",
      "Subtotal: $500.00\nTax: $40.00\nTotal: $12.00",
      "receipts@store.com",
      "Store",
    );

    expect(result.total?.value).toBe(12);
    expect(result.subtotal).toBeNull();
    expect(result.tax).toBeNull();
  });

  it("keeps a breakdown that adds up", () => {
    const result = extract_purchase_details(
      "Purchase receipt",
      "Subtotal: $100.00\nShipping: $5.00\nTax: $8.00\nTotal: $113.00",
      "receipts@store.com",
      "Store",
    );

    expect(result.subtotal?.value).toBe(100);
    expect(result.shipping_cost?.value).toBe(5);
    expect(result.tax?.value).toBe(8);
    expect(result.total?.value).toBe(113);
  });

  it("reads a rupee total without turning it into dollars", () => {
    const result = extract_purchase_details(
      "Your subscription receipt",
      "Order #AS-4471\nTotal: ₹8,629.00",
      "receipts@astermail.org",
      "Aster Privacy",
    );

    expect(result.total?.currency).toBe("INR");
    expect(result.total?.value).toBe(8629);
    expect(result.total?.formatted).toBe("₹8,629.00");
  });

  it("keeps lakh grouping intact", () => {
    const result = extract_purchase_details(
      "Your receipt",
      "Order #AS-4471\nTotal: ₹1,00,000.00",
      "receipts@store.in",
      "Store",
    );

    expect(result.total?.value).toBe(100000);
  });

  it("uses the email currency for an amount written without a symbol", () => {
    const result = extract_purchase_details(
      "Your receipt",
      "Order #AS-4471\nSubtotal: ₹500.00\nTax: 90.00\nTotal: ₹590.00",
      "receipts@store.in",
      "Store",
    );

    expect(result.tax?.currency).toBe("INR");
  });

  it("reads a trailing currency code", () => {
    const result = extract_purchase_details(
      "Your receipt",
      "Order #AS-4471\nTotal: 42.00 EUR",
      "receipts@store.eu",
      "Store",
    );

    expect(result.total?.currency).toBe("EUR");
    expect(result.total?.value).toBe(42);
  });
});

describe("is_purchase_email precision", () => {
  it("ignores prose that merely mentions an order", () => {
    expect(
      is_purchase_email(
        "In order to continue",
        "In order to download the report, sign in. You purchased nothing.",
      ),
    ).toBe(false);
  });

  it("still detects a real receipt", () => {
    expect(
      is_purchase_email(
        "Your receipt from Aster Privacy",
        "Thank you for your order. Order #AS-4471. Total: $86.99.",
      ),
    ).toBe(true);
  });
});

describe("extract_shipping_details tracking accuracy", () => {
  it("reads a UPS 1Z tracking number regardless of surrounding numbers", () => {
    const result = extract_shipping_details(
      "Your UPS package has shipped",
      "Order 8005551234567 total $129.00. Tracking number: 1Z999AA10123456784. It is on its way.",
      undefined,
      "pkginfo@ups.com",
    );

    expect(result.carrier).toBe("ups");
    expect(result.tracking_number).toBe("1Z999AA10123456784");
  });

  it("reads the Amazon TBA number and does not flip carrier to a bare number", () => {
    const result = extract_shipping_details(
      "Shipped: Your Amazon.com order",
      "Arriving tomorrow. Order #112-1234567-1234567. Tracking ID TBA303194762541. Total 500000000000.",
      undefined,
      "shipment-tracking@amazon.com",
    );

    expect(result.carrier).toBe("amazon");
    expect(result.tracking_number).toBe("TBA303194762541");
  });

  it("mines the tracking number out of the tracking url", () => {
    const result = extract_shipping_details(
      "USPS shipment update",
      'Track it: <a href="https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223817171718">here</a>. Reference 12345678901234.',
      '<a href="https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223817171718">here</a>',
      "no-reply@usps.com",
    );

    expect(result.carrier).toBe("usps");
    expect(result.tracking_number).toBe("9400111899223817171718");
  });

  it("does not treat a bare order number as a FedEx tracking number without context", () => {
    const result = extract_shipping_details(
      "Your order confirmation",
      "Thanks for your order 481516234200. Your total is $42.00.",
      undefined,
      "orders@fedex.com",
    );

    expect(result.tracking_number).toBeNull();
  });

  it("uses a bare FedEx number only inside a tracking context", () => {
    const result = extract_shipping_details(
      "FedEx shipment",
      "Your tracking number is 770123456789 and it left the facility.",
      undefined,
      "tracking@fedex.com",
    );

    expect(result.carrier).toBe("fedex");
    expect(result.tracking_number).toBe("770123456789");
  });
});

describe("detect_shipping_status via extract_shipping_details", () => {
  it("does not report delivered for a future delivery", () => {
    const result = extract_shipping_details(
      "Your package is on the way",
      "Your order will be delivered on Tuesday. Estimated delivery: Tuesday, March 5.",
      undefined,
      "ship@ups.com",
    );

    expect(result.status).not.toBe("delivered");
  });

  it("reports delivered when the subject says delivered", () => {
    const result = extract_shipping_details(
      "Delivered: your Amazon package",
      "Your package was delivered to the front door.",
      undefined,
      "shipment-tracking@amazon.com",
    );

    expect(result.status).toBe("delivered");
  });

  it("reports out_for_delivery ahead of any delivered keyword", () => {
    const result = extract_shipping_details(
      "Out for delivery",
      "Your package is out for delivery and will be delivered today.",
      undefined,
      "ship@fedex.com",
    );

    expect(result.status).toBe("out_for_delivery");
  });

  it("reports label_created ahead of the broad shipped keyword", () => {
    const result = extract_shipping_details(
      "Shipping label created",
      "A shipping label was created and your item will be shipped soon.",
      undefined,
      "orders@example.com",
    );

    expect(result.status).toBe("label_created");
  });
});

describe("carrier name matching", () => {
  it("does not read a carrier out of an unrelated word", () => {
    const result = extract_shipping_details(
      "Your subscription groups were updated",
      "We reorganized your groups and backups this week.",
      undefined,
      "no-reply@example.com",
    );

    expect(result.carrier).not.toBe("ups");
  });

  it("still matches a real carrier mention on a word boundary", () => {
    const result = extract_shipping_details(
      "Shipment update",
      "Your parcel was handed to UPS for delivery.",
      undefined,
      "no-reply@example.com",
    );

    expect(result.carrier).toBe("ups");
  });
});

describe("purchase item parsing", () => {
  it("keeps an item name that starts with a digit", () => {
    const result = extract_purchase_details(
      "Your receipt",
      "Order #ABC-12345.\n3M Command Strips (Qty:2) $12.00\nOrder total: $24.00.",
      "receipts@store.com",
      "Store Receipts",
    );

    const item = result.items[0];

    expect(item.name).toBe("3M Command Strips");
    expect(item.quantity).toBe(2);
  });

  it("formats a non-USD item total with the right symbol", () => {
    const result = extract_purchase_details(
      "Ihre Rechnung",
      "Bestellung #DE-98765. 2 x Kaffeebecher - €8.50. Gesamt: €17.00.",
      "rechnung@shop.de",
      "Shop Rechnung",
    );

    const item = result.items[0];

    expect(item.total_price?.formatted).toBe("€17.00");
  });

  it("strips only trailing role words from the merchant name", () => {
    const result = extract_purchase_details(
      "Your receipt",
      "Order #ABC-12345. Total: $24.00.",
      "receipts@shippingsupplies.com",
      "Shipping Supplies Inc Order",
    );

    expect(result.merchant_name).toBe("Shipping Supplies Inc");
  });
});
