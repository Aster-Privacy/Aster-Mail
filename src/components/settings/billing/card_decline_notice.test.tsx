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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { CardDeclineNotice, card_decline_message_key } = await import(
  "./card_decline_notice"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_notice(reason: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <CardDeclineNotice
        decline={
          reason === null ? null : { reason, at: "2026-09-01T00:00:00Z" }
        }
      />,
    );
  });

  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());

  root = null;
  container?.remove();
  container = null;
});

describe("card_decline_message_key", () => {
  it("maps every reason the server can return", () => {
    expect(card_decline_message_key("insufficient_funds")).toBe(
      "settings.card_declined_insufficient_funds",
    );
    expect(card_decline_message_key("expired_card")).toBe(
      "settings.card_declined_expired_card",
    );
    expect(card_decline_message_key("card_details")).toBe(
      "settings.card_declined_card_details",
    );
    expect(card_decline_message_key("card_not_supported")).toBe(
      "settings.card_declined_card_not_supported",
    );
    expect(card_decline_message_key("contact_bank")).toBe(
      "settings.card_declined_contact_bank",
    );
  });

  it("falls back rather than rendering an unknown reason", () => {
    expect(card_decline_message_key("do_not_honor")).toBe(
      "settings.card_declined_contact_bank",
    );
    expect(card_decline_message_key("")).toBe(
      "settings.card_declined_contact_bank",
    );
  });
});

describe("CardDeclineNotice", () => {
  it("renders nothing without a decline", async () => {
    const node = await render_notice(null);

    expect(node.textContent).toBe("");
  });

  it("shows the title and the mapped message", async () => {
    const node = await render_notice("expired_card");

    expect(node.textContent).toContain("settings.card_declined_title");
    expect(node.textContent).toContain("settings.card_declined_expired_card");
  });

  it("never renders the raw code from the server", async () => {
    const node = await render_notice("lost_card");

    expect(node.textContent).not.toContain("lost_card");
    expect(node.textContent).toContain("settings.card_declined_contact_bank");
  });
});
