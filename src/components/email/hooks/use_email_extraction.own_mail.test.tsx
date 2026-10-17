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
import type { EmailExtractionResult } from "@/services/extraction/types";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  use_email_extraction,
  type EmailExtractionSource,
} from "@/components/email/hooks/use_email_extraction";
import {
  clear_sender_trust_context,
  set_trust_own_addresses,
  set_trust_primary_address,
} from "@/lib/sender_trust_store";

const ORDER_TEXT =
  "Thank you for your purchase. Order #AB-9876. Subtotal: €40.00. Total: €42.50. Payment method: card.";

function source(from_email: string): EmailExtractionSource {
  return {
    email_id: `msg-${from_email}`,
    subject: "Order confirmed: AB-9876",
    body_text: ORDER_TEXT,
    body_html: undefined,
    from_email,
    from_name: "Example Store",
  };
}

let container: HTMLDivElement;
let root: Root;
let latest: EmailExtractionResult | null = null;

function Probe({ input }: { input: EmailExtractionSource }) {
  latest = use_email_extraction(input);

  return null;
}

function render(input: EmailExtractionSource): EmailExtractionResult | null {
  act(() => {
    root.render(<Probe input={input} />);
  });

  return latest;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  latest = null;
  set_trust_primary_address("me@astermail.org");
  set_trust_own_addresses(["shop.alias@astermail.org"]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  set_trust_primary_address("");
  clear_sender_trust_context();
});

describe("use_email_extraction on mail the user sent", () => {
  it("still finds order details in mail from someone else", () => {
    const result = render(source("orders@example.com"));

    expect(result?.has_purchase_details).toBe(true);
  });

  it("skips extraction for mail sent from the primary address", () => {
    expect(render(source("me@astermail.org"))).toBeNull();
  });

  it("skips extraction for mail sent from an alias, ignoring case", () => {
    expect(render(source("Shop.Alias@AsterMail.org"))).toBeNull();
  });

  it("starts extracting once the address is no longer the user's", () => {
    expect(render(source("me@astermail.org"))).toBeNull();

    act(() => set_trust_primary_address("someone.else@astermail.org"));

    expect(render(source("me@astermail.org"))?.has_purchase_details).toBe(true);
  });
});
