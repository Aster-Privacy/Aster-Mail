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
  titlecase_localpart,
  preview_sender_label,
  domain_brand_label,
} from "@/hooks/use_category_previews";

describe("titlecase_localpart", () => {
  it("capitalizes a bare localpart", () => {
    expect(titlecase_localpart("newsletter")).toBe("Newsletter");
    expect(titlecase_localpart("orders")).toBe("Orders");
  });

  it("splits the common separators into words", () => {
    expect(titlecase_localpart("no-reply")).toBe("No Reply");
    expect(titlecase_localpart("billing.support")).toBe("Billing Support");
    expect(titlecase_localpart("news_letter")).toBe("News Letter");
    expect(titlecase_localpart("shop+deals")).toBe("Shop Deals");
  });

  it("leaves brand casing alone", () => {
    expect(titlecase_localpart("eBay")).toBe("eBay");
    expect(titlecase_localpart("GitHub")).toBe("GitHub");
  });

  it("survives input with nothing to capitalize", () => {
    expect(titlecase_localpart("")).toBe("");
    expect(titlecase_localpart("---")).toBe("---");
    expect(titlecase_localpart("123")).toBe("123");
  });
});

describe("domain_brand_label", () => {
  it("uses the registrable label", () => {
    expect(domain_brand_label("theverge.com")).toBe("Theverge");
    expect(domain_brand_label("acme-id.com")).toBe("Acme Id");
  });

  it("drops sending subdomains", () => {
    expect(domain_brand_label("email.nike.com")).toBe("Nike");
    expect(domain_brand_label("notifications.github.com")).toBe("Github");
  });

  it("looks past a second level suffix", () => {
    expect(domain_brand_label("shop.co.uk")).toBe("Shop");
    expect(domain_brand_label("news.bbc.co.uk")).toBe("Bbc");
  });

  it("returns nothing for an empty domain", () => {
    expect(domain_brand_label("")).toBe("");
  });
});

describe("preview_sender_label", () => {
  it("prefers the display name", () => {
    expect(preview_sender_label("The Verge", "news@theverge.com")).toBe(
      "The Verge",
    );
  });

  it("falls back to the brand when the localpart is generic", () => {
    expect(preview_sender_label(undefined, "no-reply@reddit.com")).toBe(
      "Reddit",
    );
    expect(preview_sender_label(undefined, "news@theverge.com")).toBe(
      "Theverge",
    );
    expect(preview_sender_label(undefined, "security@acme-id.com")).toBe(
      "Acme Id",
    );
    expect(preview_sender_label(undefined, "orders@northwind-store.com")).toBe(
      "Northwind Store",
    );
  });

  it("keeps a meaningful localpart", () => {
    expect(preview_sender_label(undefined, "alex@f6s.com")).toBe("Alex");
    expect(preview_sender_label(undefined, "jane.doe@example.com")).toBe(
      "Jane Doe",
    );
  });
});
