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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import {
  build_currency_context,
  format_amount,
  fraction_digits,
  parse_amount,
  parse_number,
} from "./money";
import { extract_purchase_details } from "./extractor";

const flat = (s: string | undefined) => (s ?? "").replace(/[  ]/g, " ");

function amount(
  line: string,
  from = "shop@store.com",
  locale = "en-US",
  body = line,
) {
  const context = build_currency_context(body, from, locale);

  return parse_amount(line, context, locale);
}

describe("swedish receipt from the report", () => {
  const body = [
    "Tack för din beställning",
    "Subtotal: 636,00 kr",
    "Discount: 99,80 kr",
    "Shipping: 0,00 kr",
    "Tax: 134,00 kr",
    "Total: 670,20 kr",
  ].join("\n");

  it("keeps the total in kronor at its real size", () => {
    const result = extract_purchase_details(
      "Order confirmation",
      body,
      "order@butik.se",
      "Butik",
    );

    expect(result.total?.currency).toBe("SEK");
    expect(result.total?.value).toBeCloseTo(670.2);
    expect(flat(result.total?.formatted)).toBe("SEK 670.20");
  });

  it("keeps every amount row in kronor", () => {
    const result = extract_purchase_details(
      "Order confirmation",
      body,
      "order@butik.se",
      "Butik",
    );

    expect(result.subtotal?.currency).toBe("SEK");
    expect(result.subtotal?.value).toBeCloseTo(636);
    expect(result.discount?.value).toBeCloseTo(99.8);
    expect(result.tax?.currency).toBe("SEK");
    expect(result.tax?.value).toBeCloseTo(134);
  });

  it("does not turn kronor into dollars for a .com sender", () => {
    const result = extract_purchase_details(
      "Order",
      "Total: 670,20 kr",
      "order@shop.com",
      "Shop",
    );

    expect(result.total?.currency).toBe("SEK");
    expect(result.total?.value).toBeCloseTo(670.2);
  });

  it("shows kronor in the Swedish format for a Swedish user", () => {
    expect(flat(format_amount(670.2, "SEK", "sv-SE"))).toBe("670,20 kr");
  });

  it("reads the colon dash price style", () => {
    const parsed = amount("Pris 199:-", "info@butik.se");

    expect(parsed?.currency).toBe("SEK");
    expect(parsed?.value).toBe(199);
  });
});

describe("currency resolution", () => {
  it.each([
    ["Total: 450,00 kr", "kundeservice@butikk.no", "NOK", 450],
    ["Total: 450,00 kr", "ordre@butik.dk", "DKK", 450],
    ["Total: 450,00 kr", "order@butik.se", "SEK", 450],
    ["Total: 1.234,56 €", "shop@laden.de", "EUR", 1234.56],
    ["Total: €1,234.56", "shop@store.ie", "EUR", 1234.56],
    ["Total: 1 234,56 €", "shop@boutique.fr", "EUR", 1234.56],
    ["Total: CHF 1'234.50", "shop@laden.ch", "CHF", 1234.5],
    ["Total: Fr. 12.50", "shop@laden.ch", "CHF", 12.5],
    ["Total: ¥12,800", "shop@store.jp", "JPY", 12800],
    ["Total: ₩45,000", "shop@store.kr", "KRW", 45000],
    ["Total: KWD 12.500", "shop@store.com", "KWD", 12.5],
    ["Total: BHD 1.250", "shop@store.com", "BHD", 1.25],
    ["Total: 1 249,99 zł", "sklep@sklep.pl", "PLN", 1249.99],
    ["Total: 1 249,00 Kč", "obchod@obchod.cz", "CZK", 1249],
    ["Total: 12 990 Ft", "bolt@bolt.hu", "HUF", 12990],
    ["Total: 249,99 lei", "shop@shop.ro", "RON", 249.99],
    ["Total: R$ 1.299,90", "loja@loja.com.br", "BRL", 1299.9],
    ["Total: 2 499 ₽", "shop@shop.ru", "RUB", 2499],
    ["Total: ₺1.299,90", "shop@shop.com.tr", "TRY", 1299.9],
    ["Total: ₪249.90", "shop@shop.co.il", "ILS", 249.9],
    ["Total: ₱1,299.00", "shop@shop.ph", "PHP", 1299],
    ["Total: ฿1,290.00", "shop@shop.co.th", "THB", 1290],
    ["Total: Rs. 8,629.00", "shop@shop.in", "INR", 8629],
    ["Total: ₹1,00,000.00", "shop@shop.in", "INR", 100000],
    ["Total: £19.99", "shop@shop.co.uk", "GBP", 19.99],
    ["Total: CA$19.99", "shop@shop.com", "CAD", 19.99],
    ["Total: A$19.99", "shop@shop.com", "AUD", 19.99],
    ["Total: NZ$19.99", "shop@shop.com", "NZD", 19.99],
    ["Total: HK$19.99", "shop@shop.com", "HKD", 19.99],
    ["Total: S$19.99", "shop@shop.com", "SGD", 19.99],
    ["Total: MX$199.00", "shop@shop.com", "MXN", 199],
    ["Total: US$19.99", "shop@shop.ca", "USD", 19.99],
    ["Total: $19.99", "shop@shop.ca", "CAD", 19.99],
    ["Total: $19.99", "shop@shop.com.au", "AUD", 19.99],
    ["Total: $19.99", "shop@shop.com", "USD", 19.99],
    ["Total: 42.00 EUR", "shop@shop.com", "EUR", 42],
    ["Total: 12,30 EUR", "shop@shop.com", "EUR", 12.3],
    ["Total: 99.00 AED", "shop@shop.com", "AED", 99],
  ])("%s from %s is %s", (line, from, code, value) => {
    const parsed = amount(line, from);

    expect(parsed?.currency).toBe(code);
    expect(parsed?.value).toBeCloseTo(value as number);
  });

  it("lets an explicit code win over the sender domain", () => {
    expect(
      amount(
        "Total: 450,00 kr",
        "order@butik.se",
        "en-US",
        "Total: 450,00 kr\nAll prices in NOK 450,00",
      )?.currency,
    ).toBe("NOK");
  });

  it("does not use a Canadian locale to guess a bare dollar from a .com sender", () => {
    expect(amount("Total: $19.99", "shop@shop.com", "en-CA")?.currency).toBe(
      "USD",
    );
  });

  it("uses the locale for a bare krona sign with no other evidence", () => {
    expect(amount("Total: 450,00 kr", "shop@shop.com", "nb-NO")?.currency).toBe(
      "NOK",
    );
  });

  it("never invents a currency", () => {
    const parsed = amount("Total: 42.00", "shop@shop.com");

    expect(parsed?.currency).toBe("");
    expect(parsed?.value).toBe(42);
    expect(parsed?.formatted).toBe("42.00");
  });

  it("does not read ordinary words as currency codes", () => {
    const context = build_currency_context(
      "You can add 2 items for all 3 of us",
      "shop@shop.com",
      "en-US",
    );

    expect(context.dominant).toBeNull();
  });

  it("never reports dollars for a receipt with no dollar sign", () => {
    for (const body of [
      "Total: 670,20 kr",
      "Total: 1.234,56 €",
      "Total: 12 990 Ft",
      "Total: ¥12,800",
    ]) {
      const result = extract_purchase_details(
        "Receipt",
        body,
        "order@shop.com",
        "Shop",
      );

      expect(result.total?.currency).not.toBe("USD");
    }
  });
});

describe("percentages are not money", () => {
  it("reads the amounts, not the tax rate", () => {
    const result = extract_purchase_details(
      "Receipt",
      "Tax (25%): 134,04 kr\nTotal: 670,20 kr",
      "order@butik.se",
      "Butik",
    );

    expect(result.total?.value).toBeCloseTo(670.2);
    expect(result.tax?.value).toBeCloseTo(134.04);
  });
});

describe("parse_number", () => {
  it.each([
    ["670,20", "SEK", 670.2],
    ["1.234,56", "EUR", 1234.56],
    ["1,234.56", "USD", 1234.56],
    ["1 234,56", "EUR", 1234.56],
    ["1 234,56", "EUR", 1234.56],
    ["1'234.50", "CHF", 1234.5],
    ["1,00,000.00", "INR", 100000],
    ["12,800", "JPY", 12800],
    ["1,234", "USD", 1234],
    ["1.234", "EUR", 1234],
    ["12.500", "KWD", 12.5],
    ["0,99", "EUR", 0.99],
    ["199", "SEK", 199],
  ])("%s in %s", (raw, currency, value) => {
    expect(parse_number(raw as string, currency as string)).toBeCloseTo(
      value as number,
    );
  });

  it("rejects garbage", () => {
    expect(parse_number("12..5", "USD")).toBeNull();
  });
});

describe("format_amount and fraction_digits", () => {
  it("uses each currency's own decimals", () => {
    expect(fraction_digits("JPY")).toBe(0);
    expect(fraction_digits("KRW")).toBe(0);
    expect(fraction_digits("KWD")).toBe(3);
    expect(fraction_digits("SEK")).toBe(2);
    expect(fraction_digits("")).toBe(2);
  });

  it.each([
    [19.99, "EUR", "en-US", "€19.99"],
    [12800, "JPY", "en-US", "¥12,800"],
    [1249.99, "PLN", "en-US", "PLN 1,249.99"],
    [12.5, "KWD", "en-US", "KWD 12.500"],
    [99, "AED", "en-US", "AED 99.00"],
  ])("%d %s in %s", (value, currency, locale, expected) => {
    expect(
      flat(
        format_amount(value as number, currency as string, locale as string),
      ),
    ).toBe(expected);
  });
});
