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
import type { YearlySwitchOffer } from "@/services/api/billing";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { YearlySwitchCard, monthly_equivalent_cents } = await import(
  "./yearly_switch_card"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const eligible: YearlySwitchOffer = {
  plan_code: "star",
  monthly_price_cents: 500,
  yearly_price_cents: 5000,
  saving_cents: 1000,
};

async function render_card(
  offer: YearlySwitchOffer | null,
  on_switch: (plan_code: string) => void = () => {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<YearlySwitchCard offer={offer} on_switch={on_switch} />);
  });

  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());

  root = null;
  container?.remove();
  container = null;
});

describe("monthly_equivalent_cents", () => {
  it("spreads the yearly price over twelve months", () => {
    expect(monthly_equivalent_cents(5000)).toBe(417);
    expect(monthly_equivalent_cents(12000)).toBe(1000);
  });
});

describe("YearlySwitchCard", () => {
  it("renders nothing without an offer", async () => {
    const node = await render_card(null);

    expect(node.textContent).toBe("");
  });

  it("renders nothing when the yearly plan saves nothing", async () => {
    const node = await render_card({ ...eligible, saving_cents: 0 });

    expect(node.textContent).toBe("");
  });

  it("shows the saving and the action", async () => {
    const node = await render_card(eligible);

    expect(node.textContent).toContain("settings.yearly_switch_title");
    expect(node.textContent).toContain("settings.yearly_switch_action");
  });

  it("reports the plan to switch when the button is clicked", async () => {
    const switched: string[] = [];
    const node = await render_card(eligible, (code) => switched.push(code));
    const button = node.querySelector("button");

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(switched).toEqual(["star"]);
  });
});
