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
import type { BillingHistoryItem } from "@/services/api/billing";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/services/api/billing", () => ({
  format_price: (cents: number) => String(cents),
  format_date: (value: string) => value,
}));
vi.mock("@/components/settings/load_failed_notice", () => ({
  LoadFailedNotice: () => <div />,
}));
vi.mock("@/components/settings/billing/billing_more_section", () => ({
  BillingMoreRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  billing_row_icon: () => null,
}));
vi.mock("@aster/ui", () => ({
  Island: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  IslandSection: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  IslandDivider: () => <hr />,
  IslandRow: ({
    href,
    target,
    label,
  }: {
    href?: string;
    target?: string;
    label: React.ReactNode;
  }) =>
    href ? (
      <a data-row="" href={href} target={target}>
        {label}
      </a>
    ) : (
      <div data-row="">{label}</div>
    ),
}));

const { BillingHistorySection } = await import("./billing_history_section");

function history_item(
  id: string,
  invoice_pdf_url: string | null,
): BillingHistoryItem {
  return {
    id,
    amount_cents: 500,
    currency: "usd",
    status: "paid",
    description: null,
    plan_name: `row_${id}`,
    period_start: null,
    period_end: null,
    invoice_pdf_url,
    created_at: "2026-11-01T00:00:00Z",
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render_rows(urls: (string | null)[]): Promise<Element[]> {
  const history = urls.map((url, index) => history_item(String(index), url));

  await act(async () => {
    root.render(<BillingHistorySection history={history} />);
  });

  return Array.from(container.querySelectorAll("[data-row]"));
}

describe("billing history invoice links", () => {
  it.each([
    "https://pay.stripe.com/invoice/acct_1a/test_abc/pdf?s=ap",
    "https://invoice.stripe.com/i/acct_1a/live_abc/pdf",
  ])("links a Stripe invoice at %s", async (url) => {
    const [row] = await render_rows([url]);

    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toBe(url);
    expect(row.getAttribute("target")).toBe("_blank");
  });

  it.each([
    "https://invoice-download.example/inv.pdf",
    "https://pay.stripe.com.evil.example/invoice/pdf",
    "https://pay-stripe.com/invoice/pdf",
    "https://pay.stripe.com:8443/invoice/pdf",
    "https://user@pay.stripe.com/invoice/pdf",
    "http://pay.stripe.com/invoice/pdf",
    "https://checkout.stripe.com/c/pay/cs_live_a1",
    "javascript:alert(1)",
    "not a url",
  ])("renders no link for %s", async (url) => {
    const [row] = await render_rows([url]);

    expect(row.tagName).toBe("DIV");
    expect(row.getAttribute("href")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("links only the Stripe rows in a mixed history", async () => {
    const rows = await render_rows([
      "https://invoice-download.example/inv.pdf",
      "https://pay.stripe.com/invoice/acct_1a/test_abc/pdf",
      null,
    ]);

    expect(rows.map((row) => row.tagName)).toEqual(["DIV", "A", "DIV"]);
  });
});
