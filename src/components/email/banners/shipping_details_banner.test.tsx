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
import type { ExtractedShippingDetails } from "@/services/extraction/types";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
    language: "en",
  }),
}));

const open_external = vi.fn();
let lockdown_active = false;

vi.mock("@/utils/open_link", () => ({
  open_external: (url: string) => open_external(url),
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => lockdown_active,
}));

vi.mock("@/components/common/contacts/contact_avatar", () => ({
  ContactAvatar: ({ name }: { name?: string }) => (
    <span data-testid="contact_avatar">{name}</span>
  ),
}));

const { ShippingDetailsBanner } = await import("./shipping_details_banner");

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

beforeEach(() => {
  localStorage.clear();
  open_external.mockClear();
  lockdown_active = false;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

const base: ExtractedShippingDetails = {
  tracking_number: "1Z999AA10123456784",
  carrier: "ups",
  carrier_name: "UPS",
  tracking_url: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
  status: "in_transit",
  estimated_delivery: "Tuesday, March 5",
  shipped_date: "March 2",
  delivery_date: null,
  origin: null,
  destination: null,
  items_shipped: ["Star plan welcome kit"],
  raw_signals: [],
};

const query = (el: HTMLElement, test_id: string) =>
  el.querySelector(`[data-testid="${test_id}"]`);

describe("ShippingDetailsBanner", () => {
  it("renders the carrier header, status and tracking rows", async () => {
    const el = await render(
      <ShippingDetailsBanner
        details={base}
        sender_email="ship@ups.com"
        sender_name="UPS"
      />,
    );
    const card = query(el, "shipping_details_card");

    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("mail.package_from:UPS");
    expect(card!.textContent).toContain("mail.shipping_in_transit");
    expect(card!.textContent).toContain("mail.expected_by:Tuesday, March 5");
    expect(query(el, "shipping_tracking_row")!.textContent).toContain(
      "1Z999AA10123456784",
    );
    expect(query(el, "shipping_carrier_row")).not.toBeNull();
    expect(query(el, "contact_avatar")!.textContent).toBe("UPS");
    expect(card!.textContent).toContain("mail.shipped_on:March 2");
  });

  it("opens the tracking url unless a lockdown is active", async () => {
    const el = await render(<ShippingDetailsBanner details={base} />);
    const track = query(el, "shipping_track_package");

    expect(track!.textContent).toContain("mail.track_package");
    await click(track);
    expect(open_external).toHaveBeenCalledWith(base.tracking_url);

    lockdown_active = true;
    open_external.mockClear();
    await click(track);
    expect(open_external).not.toHaveBeenCalled();
  });

  it("hides the action row without a tracking url and shows the delivered date", async () => {
    const el = await render(
      <ShippingDetailsBanner
        details={{
          ...base,
          tracking_url: null,
          status: "delivered",
          delivery_date: "March 4",
        }}
      />,
    );

    expect(query(el, "shipping_track_package")).toBeNull();
    expect(el.textContent).toContain("mail.delivered_on:March 4");
    expect(el.textContent).not.toContain("mail.expected_by");
    expect(el.textContent).not.toContain("mail.shipped_on");
  });

  it("collapses on header click and remembers the choice", async () => {
    const el = await render(<ShippingDetailsBanner details={base} />);
    const header = el.querySelector(
      '[data-testid="shipping_details_card"] > button',
    );

    await click(header);
    expect(header!.getAttribute("aria-expanded")).toBe("false");
    expect(query(el, "shipping_tracking_row")).toBeNull();
    expect(localStorage.getItem("shipping_banner_collapsed")).toBe("1");
  });

  it("renders nothing without meaningful data", async () => {
    const el = await render(
      <ShippingDetailsBanner
        details={{
          ...base,
          tracking_number: null,
          carrier_name: null,
          status: null,
        }}
      />,
    );

    expect(query(el, "shipping_details_card")).toBeNull();
  });
});
