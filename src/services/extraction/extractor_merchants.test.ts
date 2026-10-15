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

import { extract_purchase_details, is_purchase_email } from "./extractor";

describe("marketplace order mail", () => {
  it("reads a marketplace order with a long order number", () => {
    const subject = "Your Amazon.com order #112-3456789-0123456";
    const body = [
      "Hello Adam,",
      "Thank you for your order. We will send a confirmation when your item ships.",
      "Order #112-3456789-0123456",
      "Arriving: Friday, October 17",
      "Anker USB-C Charger 65W",
      "Sold by: AnkerDirect",
      "Item Subtotal: $44.98",
      "Shipping & Handling: $0.00",
      "Estimated tax: $3.99",
      "Order Total: $48.97",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "auto-confirm@amazon.com",
      "Amazon.com",
    );

    expect(is_purchase_email(subject, body)).toBe(true);
    expect(result.merchant_name).toBe("Amazon.com");
    expect(result.order_id).toBe("112-3456789-0123456");
    expect(result.total?.formatted).toBe("$48.97");
    expect(result.document_kind).toBe("order");
    expect(result.receipt_url).toBeNull();
  });

  it("names the shop, not the marketplace, when the subject says purchase from", () => {
    const subject =
      "Your Etsy Purchase from WoodcraftByAnna (Order #3210987654)";
    const body = [
      "Thanks for your purchase from WoodcraftByAnna!",
      "Order #3210987654",
      "Walnut serving board x 1 $64.00",
      "Item total: $64.00",
      "Shipping: $8.50",
      "Tax: $5.80",
      "Order total: $78.30",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "transaction@etsy.com",
      "Etsy",
    );

    expect(result.merchant_name).toBe("WoodcraftByAnna");
    expect(result.order_id).toBe("3210987654");
    expect(result.total?.formatted).toBe("$78.30");
  });
});

describe("hosted shop order mail", () => {
  const subject = "Order #1042 confirmed";
  const body = [
    "Northwind Goods",
    "Thank you for your purchase!",
    "Hi Adam, we are getting your order ready to be shipped.",
    "Order #1042",
    "Linen Apron × 2 $60.00",
    "Subtotal $60.00",
    "Shipping $5.00",
    "Taxes $4.80",
    "Total $69.80 USD",
  ].join("\n");

  it("keeps the shop as merchant and accepts its own order link", () => {
    const html =
      '<p>Thank you for your purchase!</p><a href="https://northwindgoods.com/orders/7f3a9c">View your order</a>';
    const result = extract_purchase_details(
      subject,
      body,
      "orders@northwindgoods.com",
      "Northwind Goods",
      html,
    );

    expect(is_purchase_email(subject, body)).toBe(true);
    expect(result.merchant_name).toBe("Northwind Goods");
    expect(result.order_id).toBe("1042");
    expect(result.total?.formatted).toBe("$69.80");
    expect(result.subtotal?.formatted).toBe("$60.00");
    expect(result.shipping_cost?.formatted).toBe("$5.00");
    expect(result.document_kind).toBe("order");
    expect(result.receipt_url).toBe("https://northwindgoods.com/orders/7f3a9c");
  });

  it("refuses a view order link on a tracking domain", () => {
    const html =
      '<a href="https://click.northwindgoods-mail.com/c/abc">View your order</a>';
    const result = extract_purchase_details(
      subject,
      body,
      "orders@northwindgoods.com",
      "Northwind Goods",
      html,
    );

    expect(result.receipt_url).toBeNull();
  });

  it("keeps the shop as merchant when a friend forwards the mail", () => {
    const forwarded = [
      "Look what I ordered",
      "",
      "---------- Forwarded message ---------",
      "From: Northwind Goods <orders@northwindgoods.com>",
      "Date: Tue, Oct 14, 2026 at 9:12 AM",
      "Subject: Order #1042 confirmed",
      "To: <sam@example.com>",
      "",
      body,
    ].join("\n");
    const result = extract_purchase_details(
      "Fwd: Order #1042 confirmed",
      forwarded,
      "sam@example.com",
      "Sam Rivera",
    );

    expect(result.merchant_name).toBe("Northwind Goods");
    expect(result.merchant_source).toBe("orders@northwindgoods.com");
    expect(result.order_id).toBe("1042");
    expect(result.total?.formatted).toBe("$69.80");
  });
});

describe("processor receipt mail", () => {
  it("names the cafe on a point of sale receipt and keeps its receipt link", () => {
    const subject = "Receipt from Blue Bottle Coffee";
    const body = [
      "Blue Bottle Coffee",
      "Hayes Valley",
      "Receipt #KZ7Q1",
      "New Orleans Iced Coffee $5.50",
      "Croissant $4.25",
      "Subtotal $9.75",
      "Tax $0.85",
      "Total $10.60",
      "Visa ending in 4242",
      "View full receipt: https://squareup.com/receipt/preview/8sd7f6s5d4f",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "receipts@messaging.squareup.com",
      "Square",
    );

    expect(is_purchase_email(subject, body)).toBe(true);
    expect(result.merchant_name).toBe("Blue Bottle Coffee");
    expect(result.total?.formatted).toBe("$10.60");
    expect(result.card_last_four).toBe("4242");
    expect(result.document_kind).toBe("receipt");
    expect(result.receipt_url).toBe(
      "https://squareup.com/receipt/preview/8sd7f6s5d4f",
    );
  });

  it("names the payee on a wallet payment receipt", () => {
    const subject = "Receipt for your payment to Patagonia, Inc.";
    const body = [
      "You sent a payment of $129.00 USD to Patagonia, Inc.",
      "Transaction ID: 1AB23456CD789012E",
      "Merchant: Patagonia, Inc.",
      "Total $129.00 USD",
      "Paid with Visa x-4242",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "service@paypal.com",
      "service@paypal.com",
    );

    expect(result.merchant_name).toBe("Patagonia");
    expect(result.transaction_id).toBe("1AB23456CD789012E");
    expect(result.total?.formatted).toBe("$129.00");
    expect(result.document_kind).toBe("receipt");
  });

  it("does not accept a wallet link outside the receipt paths", () => {
    const html =
      '<a href="https://www.paypal.com/signin?returnUri=x">View receipt</a>';
    const result = extract_purchase_details(
      "Receipt for your payment to Patagonia, Inc.",
      "You sent a payment of $129.00 USD to Patagonia, Inc.\nTotal $129.00 USD",
      "service@paypal.com",
      "service@paypal.com",
      html,
    );

    expect(result.receipt_url).toBeNull();
  });
});

describe("platform receipt mail", () => {
  it("reads an app store receipt", () => {
    const subject = "Your receipt from Apple.";
    const body = [
      "Receipt",
      "APPLE ID adam@example.com",
      "ORDER ID MXYZ123456",
      "DOCUMENT NO. 123456789012",
      "DATE Oct 14, 2026",
      "Apple Music Individual (Monthly) $10.99",
      "Renews Nov 14, 2026",
      "SUBTOTAL $10.99",
      "TAX $0.00",
      "TOTAL $10.99",
      "Billed to Visa .... 1234",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "no_reply@email.apple.com",
      "Apple",
    );

    expect(result.merchant_name).toBe("Apple");
    expect(result.order_id).toBe("MXYZ123456");
    expect(result.total?.formatted).toBe("$10.99");
    expect(result.document_kind).toBe("receipt");
  });

  it("does not read a date as the merchant of a play store receipt", () => {
    const subject = "Your Google Play Order Receipt from Oct 14, 2026";
    const body = [
      "Thank you. Here is your receipt.",
      "Order number: GPA.3345-1234-5678-90123",
      "Order date: Oct 14, 2026",
      "Item: Procreate Pocket Price: $4.99",
      "Total: $4.99",
      "Payment method: Visa-1234",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "googleplay-noreply@google.com",
      "Google Play",
    );

    expect(result.merchant_name).toBe("Google Play");
    expect(result.order_id).toBe("GPA.3345-1234-5678-90123");
    expect(result.total?.formatted).toBe("$4.99");
    expect(result.items.map((item) => item.name)).toEqual(["Procreate Pocket"]);
  });

  it("reads a game store purchase without inventing an order number", () => {
    const subject = "Thank you for your Steam purchase!";
    const body = [
      "Thank you for your recent purchase on Steam.",
      "Account name: adam_plays",
      "Hollow Knight: Silksong $19.99",
      "Total: $19.99",
      "Payment method: Visa",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "noreply@steampowered.com",
      "Steam",
    );

    expect(result.merchant_name).toBe("Steam");
    expect(result.order_id).toBeNull();
    expect(result.total?.formatted).toBe("$19.99");
  });
});

describe("service receipt mail", () => {
  it("reads a ride receipt from the sender name", () => {
    const subject = "Your Thursday morning trip with Uber";
    const body = [
      "Here is your receipt for your ride, Adam.",
      "Total $18.42",
      "Trip fare $15.20",
      "Booking fee $2.10",
      "Tolls $1.12",
      "Payments",
      "Visa ••••4242 $18.42",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "noreply@uber.com",
      "Uber Receipts",
    );

    expect(is_purchase_email(subject, body)).toBe(true);
    expect(result.merchant_name).toBe("Uber");
    expect(result.total?.formatted).toBe("$18.42");
    expect(result.card_last_four).toBe("4242");
  });

  it("names the restaurant on a delivery order", () => {
    const subject = "Order Confirmation for Adam from Chipotle Mexican Grill";
    const body = [
      "Your order from Chipotle Mexican Grill is confirmed.",
      "Order #A1B2C3D4",
      "1 x Chicken Burrito Bowl - $12.50",
      "Subtotal $12.50",
      "Delivery Fee $2.99",
      "Service Fee $1.99",
      "Tip $2.00",
      "Total $19.48",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "no-reply@doordash.com",
      "DoorDash",
    );

    expect(result.merchant_name).toBe("Chipotle Mexican Grill");
    expect(result.order_id).toBe("A1B2C3D4");
    expect(result.total?.formatted).toBe("$19.48");
    expect(result.items.map((item) => item.name)).toEqual([
      "Chicken Burrito Bowl",
    ]);
  });

  it("reads an airline receipt with a confirmation code", () => {
    const subject = "eTicket Itinerary and Receipt for Confirmation ABC123";
    const body = [
      "Confirmation Number: ABC123",
      "Passenger: Adam Example",
      "Flight 1 of 2 UA 455 SFO to EWR",
      "Ticket Number: 0162345678901",
      "Base fare $362.79",
      "Taxes and fees $49.81",
      "Total: $412.60",
      "Payment method: Visa ending in 4242",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "no-reply@united.com",
      "United Airlines",
    );

    expect(is_purchase_email(subject, body)).toBe(true);
    expect(result.merchant_name).toBe("United Airlines");
    expect(result.confirmation_number).toBe("ABC123");
    expect(result.order_id).toBe("ABC123");
    expect(result.total?.formatted).toBe("$412.60");
    expect(result.document_kind).toBe("receipt");
  });

  it("reads a software invoice", () => {
    const subject = "Your Figma invoice is available";
    const body = [
      "Invoice #FIG-2026-00123",
      "Billing period: Oct 14, 2026 to Nov 13, 2026",
      "Professional plan, 1 editor $15.00",
      "Amount due $15.00",
      "Paid with Visa ending in 4242",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "billing@figma.com",
      "Figma",
    );

    expect(result.merchant_name).toBe("Figma");
    expect(result.order_id).toBe("FIG-2026-00123");
    expect(result.total?.formatted).toBe("$15.00");
    expect(result.card_last_four).toBe("4242");
    expect(result.document_kind).toBe("receipt");
  });

  it("reads a euro invoice from a hosting provider", () => {
    const subject = "Invoice 2026-10-0042 from Hetzner Online GmbH";
    const body = [
      "Invoice no.: 2026-10-0042",
      "Invoice date: 14.10.2026",
      "Cloud server cx22 (1 month) 1 x €4.35",
      "Net total €4.35",
      "VAT 19% €0.83",
      "Total €5.18",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "invoice@hetzner.com",
      "Hetzner Online",
    );

    expect(result.merchant_name).toBe("Hetzner Online GmbH");
    expect(result.order_id).toBe("2026-10-0042");
    expect(result.total?.formatted).toBe("€5.18");
    expect(result.tax?.formatted).toBe("€0.83");
  });
});

describe("receipts that name the payee in the body", () => {
  it("reads a wallet payment sent to a named payee", () => {
    const subject = "You sent a payment of $23.50 USD to Riverbend Bakery";
    const body = [
      "Hello Adam,",
      "You sent a payment of $23.50 USD to Riverbend Bakery.",
      "Transaction ID: 7HK22941WE3315802",
      "Paid with Visa ending with 4242",
      "Taxes $1.50",
      "Total $23.50 USD",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "service@paypal.com",
      "service@paypal.com",
    );

    expect(is_purchase_email(subject, body)).toBe(true);
    expect(result.merchant_name).toBe("Riverbend Bakery");
    expect(result.card_last_four).toBe("4242");
    expect(result.tax?.formatted).toBe("$1.50");
    expect(result.total?.formatted).toBe("$23.50");
  });

  it("treats a short thanks line and a receipt number as a purchase", () => {
    const subject = "Your Vapor receipt";
    const body = [
      "Thanks for your Vapor purchase.",
      "Receipt #R-20261015-7781",
      "Paid with card ending in 1881",
      "Total: $12.00",
    ].join("\n");
    const result = extract_purchase_details(
      subject,
      body,
      "billing@vapor.example",
      "Vapor",
    );

    expect(is_purchase_email(subject, body)).toBe(true);
    expect(result.card_last_four).toBe("1881");
  });

  it("does not take a flight or trip word as the merchant", () => {
    const result = extract_purchase_details(
      "Your Flight Receipt",
      "Confirmation #QX7YT2\nTotal $412.30\nPaid with Visa ending in 9001",
      "receipts@skylane.example",
      "Skylane Air",
    );

    expect(result.merchant_name).toBe("Skylane Air");
  });
});

describe("mail that is not a purchase", () => {
  it("ignores a shop newsletter", () => {
    const subject = "New arrivals: fall layers are here";
    const body = [
      "Shop the new collection.",
      "Our order of the day: cozy knits from $59.",
      "Free shipping on orders over $75.",
      "Unsubscribe",
    ].join("\n");

    expect(is_purchase_email(subject, body)).toBe(false);
  });

  it("ignores a shipping update that repeats the order number", () => {
    const subject = "Your order has shipped";
    const body = [
      "Good news, order #1042 is on its way.",
      "Tracking number: 1Z999AA10123456784",
      "Estimated delivery: Friday",
    ].join("\n");

    expect(is_purchase_email(subject, body)).toBe(false);
  });

  it("ignores a processor newsletter", () => {
    const subject = "Sessions 2026: what you missed";
    const body =
      "Watch the keynote, read the product recap, and see what payments look like next year.";

    expect(is_purchase_email(subject, body)).toBe(false);
  });

  it("ignores a password reset that mentions an account total", () => {
    const subject = "Reset your password";
    const body =
      "Someone requested a password reset. If this was not you, ignore this mail. Total devices signed in: 2.";

    expect(is_purchase_email(subject, body)).toBe(false);
  });
});
