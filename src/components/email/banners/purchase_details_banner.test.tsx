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
import type { ExtractedPurchaseDetails } from "@/services/extraction/types";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { REVIEW_STORE_KEY } from "@/services/extraction/review_store";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
    language: "en",
  }),
}));

const open_external = vi.fn();

vi.mock("@/utils/open_link", () => ({
  open_external: (url: string) => open_external(url),
}));

const { PurchaseDetailsBanner } = await import("./purchase_details_banner");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(element: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });

  return container;
}

async function click(element: Element | null) {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

async function type_into(element: Element | null, value: string) {
  await act(async () => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;

    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

const amount = (value: number, formatted: string) => ({
  value,
  currency: "USD",
  formatted,
});

const base: ExtractedPurchaseDetails = {
  document_kind: "order",
  merchant_source: "billing@astermail.org",
  receipt_url: null,
  order_id: "AS-4471",
  order_date: "March 5, 2026",
  merchant_name: "Aster Privacy",
  items: [
    {
      name: "Star plan",
      quantity: 1,
      unit_price: null,
      total_price: amount(86.99, "$86.99"),
    },
    { name: "", quantity: null, unit_price: null, total_price: null },
  ],
  subtotal: amount(86.99, "$86.99"),
  tax: null,
  shipping_cost: null,
  discount: amount(1, "$1.00"),
  total: amount(85.99, "$85.99"),
  payment_method: null,
  card_last_four: "4242",
  billing_address: null,
  confirmation_number: null,
  transaction_id: null,
  raw_signals: [],
};

const query = (el: HTMLElement, test_id: string) =>
  el.querySelector(`[data-testid="${test_id}"]`);

describe("PurchaseDetailsBanner", () => {
  it("renders the merchant in the header and the details rows", async () => {
    const el = await render(
      <PurchaseDetailsBanner details={base} email_id="m1" />,
    );
    const card = query(el, "purchase_details_card");

    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("mail.order_from:Aster Privacy");
    expect(card!.textContent).toContain("mail.order_number:AS-4471");
    expect(query(el, "purchase_merchant_row")).not.toBeNull();
    expect(query(el, "purchase_order_id_row")).not.toBeNull();
    expect(query(el, "purchase_items_row")!.textContent).toContain("Star plan");
    expect(query(el, "purchase_total_row")!.textContent).toContain("$85.99");
    expect(query(el, "purchase_total_row")!.textContent).toContain("−$1.00");
    expect(card!.textContent).toContain("mail.card_ending_in:4242");
  });

  it("titles a receipt differently from an order", async () => {
    const el = await render(
      <PurchaseDetailsBanner
        details={{ ...base, document_kind: "receipt" }}
        email_id="m1"
      />,
    );

    expect(el.textContent).toContain("mail.receipt_from:Aster Privacy");
    expect(el.textContent).toContain("mail.receipt_number:AS-4471");
  });

  it("collapses on header click and remembers the choice", async () => {
    const el = await render(
      <PurchaseDetailsBanner details={base} email_id="m1" />,
    );
    const header = el.querySelector(
      '[data-testid="purchase_details_card"] > button',
    );

    expect(header!.getAttribute("aria-expanded")).toBe("true");
    await click(header);
    expect(header!.getAttribute("aria-expanded")).toBe("false");
    expect(query(el, "purchase_total_row")).toBeNull();
    expect(localStorage.getItem("receipt_banner_collapsed")).toBe("1");
  });

  it("confirms locally without any network call", async () => {
    const fetch_spy = vi.spyOn(globalThis, "fetch");
    const el = await render(
      <PurchaseDetailsBanner details={base} email_id="m1" />,
    );

    await click(query(el, "purchase_review_confirm"));

    expect(fetch_spy).not.toHaveBeenCalled();
    expect(
      query(el, "purchase_review_confirm")!.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(el.textContent).not.toContain("mail.receipt_review_looks_right");
    expect(localStorage.getItem(REVIEW_STORE_KEY)).toContain('"m1"');
    fetch_spy.mockRestore();
  });

  it("saves a correction and reuses it for the same sender", async () => {
    const el = await render(
      <PurchaseDetailsBanner
        details={{ ...base, merchant_name: "JKatt" }}
        email_id="m1"
      />,
    );

    await click(query(el, "purchase_review_edit"));
    await type_into(query(el, "purchase_review_merchant"), "Aster Privacy ");
    await click(query(el, "purchase_review_save"));

    expect(query(el, "purchase_review_form")).toBeNull();
    expect(el.textContent).toContain("mail.order_from:Aster Privacy");
    expect(
      query(el, "purchase_review_edit")!.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      query(el, "purchase_review_footer")!
        .querySelector("button")!
        .getAttribute("aria-label"),
    ).toBe("mail.receipt_review_saved");

    const second = await render(
      <PurchaseDetailsBanner
        details={{ ...base, merchant_name: "JKatt" }}
        email_id="m2"
      />,
    );

    expect(second.textContent).toContain("mail.order_from:Aster Privacy");
  });

  it("hides the card when asked and stays hidden", async () => {
    const el = await render(
      <PurchaseDetailsBanner details={base} email_id="m1" />,
    );

    await click(query(el, "purchase_review_edit"));
    await click(query(el, "purchase_review_hide"));

    expect(query(el, "purchase_details_card")).toBeNull();

    const again = await render(
      <PurchaseDetailsBanner details={base} email_id="m1" />,
    );

    expect(query(again, "purchase_details_card")).toBeNull();
  });

  it("opens the receipt link locally when one is present", async () => {
    const el = await render(
      <PurchaseDetailsBanner
        details={{
          ...base,
          document_kind: "receipt",
          receipt_url: "https://pay.stripe.com/receipts/payment/abc",
        }}
        email_id="m9"
      />,
    );

    expect(query(el, "purchase_view_receipt")!.textContent).toContain(
      "mail.view_receipt",
    );
    await click(query(el, "purchase_view_receipt"));
    expect(open_external).toHaveBeenCalledWith(
      "https://pay.stripe.com/receipts/payment/abc",
    );
    expect(query(el, "purchase_view_receipt")).not.toBeNull();
  });

  it("renders nothing without meaningful data", async () => {
    const el = await render(
      <PurchaseDetailsBanner
        details={{
          ...base,
          order_id: null,
          merchant_name: null,
          total: null,
          items: [],
        }}
      />,
    );

    expect(query(el, "purchase_details_card")).toBeNull();
  });
});
