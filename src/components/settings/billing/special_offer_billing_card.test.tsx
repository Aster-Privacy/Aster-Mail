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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const show_offer_mock = vi.fn();
let offer_status: { available: boolean } | null = null;
let pricing_available = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/lib/special_offer", () => ({
  SPECIAL_OFFER_PERCENT_OFF: 50,
  is_special_offer_available: ({ plan_code }: { plan_code: string | null }) =>
    plan_code === "free" && pricing_available,
}));

vi.mock("@/stores/special_offer_store", () => ({
  show_special_offer: show_offer_mock,
}));

vi.mock("@/stores/special_offer_status", () => ({
  use_special_offer_status: () => ({ status: offer_status, is_loaded: true }),
}));

const { SpecialOfferBillingCard } = await import(
  "./special_offer_billing_card"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_card(plan_code: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<SpecialOfferBillingCard plan_code={plan_code} />);
  });

  return container;
}

describe("SpecialOfferBillingCard", () => {
  beforeEach(() => {
    show_offer_mock.mockReset();
    offer_status = { available: true };
    pricing_available = true;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("opens the offer for an eligible free user", async () => {
    const node = await render_card("free");
    const button = node.querySelector("button");

    expect(node.textContent).toContain("settings.special_offer_title");
    expect(button).not.toBeNull();

    await act(async () => {
      button!.click();
    });

    expect(show_offer_mock).toHaveBeenCalledWith("manual");
  });

  it("stays hidden for a paid plan", async () => {
    const node = await render_card("nova");

    expect(node.innerHTML).toBe("");
  });

  it("stays hidden when the server says the offer is unavailable", async () => {
    offer_status = { available: false };
    const node = await render_card("free");

    expect(node.innerHTML).toBe("");
  });

  it("stays hidden before the status loads", async () => {
    offer_status = null;
    const node = await render_card("free");

    expect(node.innerHTML).toBe("");
  });

  it("stays hidden when the offer is not configured", async () => {
    pricing_available = false;
    const node = await render_card("free");

    expect(node.innerHTML).toBe("");
  });
});
