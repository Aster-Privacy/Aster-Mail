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
import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/ui/dropdown_menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({
    children,
    ...rest
  }: {
    children: ReactNode;
    "data-testid"?: string;
  }) => <div data-testid={rest["data-testid"]}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    ...rest
  }: {
    children: ReactNode;
    "data-testid"?: string;
  }) => <div data-testid={rest["data-testid"]}>{children}</div>,
}));

const { SenderProfileCard } = await import("./sender_profile_card");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const strings = {
  add_to_contacts: "add_to_contacts",
  remove_from_contacts: "remove_from_contacts",
  notes: "notes",
  hide_notes: "hide_notes",
  messages_from: "messages_from",
  send_email: "send_email",
  allow_sender: "allow_sender",
  remove_from_allowlist: "remove_from_allowlist",
  block_sender: "block_sender",
  unblock_sender: "unblock_sender",
};

function render_card(email: string, is_aster_user: boolean) {
  act(() => {
    root!.render(
      <SenderProfileCard
        is_open
        allowlist_disabled={false}
        contact_disabled={false}
        copy_row={<span data-testid="copy_row">copy</span>}
        display_name="Kosei Arima"
        email={email}
        is_allowlist_loading={false}
        is_allowlisted={false}
        is_aster_user={is_aster_user}
        is_blocked={false}
        is_blocking={false}
        is_contact={false}
        is_contact_loading={false}
        render_avatar={() => <span data-testid="avatar" />}
        show_notes={false}
        strings={strings}
        on_allowlist_action={() => {}}
        on_block_action={() => {}}
        on_contact_action={() => {}}
        on_messages_from={() => {}}
        on_open_change={() => {}}
        on_toggle_notes={() => {}}
      >
        <span>Kosei Arima</span>
      </SenderProfileCard>,
    );
  });

  return container!.querySelector('[data-testid="sender_profile_card"]')!;
}

describe("SenderProfileCard", () => {
  it("lets the name and address be selected as text", () => {
    const card = render_card("kosei@astermail.org", true);
    const name = card.querySelector('[data-testid="sender_card_name"]')!;
    const address = card.querySelector('[data-testid="sender_card_email"]')!;

    expect(name.hasAttribute("data-selectable")).toBe(true);
    expect(address.hasAttribute("data-selectable")).toBe(true);
    expect(address.textContent).toBe("kosei@astermail.org");
    expect(address.getAttribute("title")).toBe("kosei@astermail.org");
    expect(address.closest("button")).toBeNull();
  });

  it("shows the copy action first for an Aster sender", () => {
    const card = render_card("kosei@astermail.org", true);
    const items = card.querySelectorAll("[data-testid]");
    const ids = Array.from(items).map((el) => el.getAttribute("data-testid"));

    expect(ids.indexOf("copy_row")).toBeGreaterThan(-1);
    expect(ids.indexOf("copy_row")).toBeLessThan(
      ids.indexOf("sender_card_contact"),
    );
    expect(card.querySelector('[data-testid="sender_card_block"]')).toBeNull();
  });

  it("keeps the copy action and adds safety actions for an outside sender", () => {
    const card = render_card("kaori@example.com", false);

    expect(card.querySelector('[data-testid="copy_row"]')).not.toBeNull();
    expect(
      card.querySelector('[data-testid="sender_card_allowlist"]'),
    ).not.toBeNull();
    expect(
      card.querySelector('[data-testid="sender_card_block"]'),
    ).not.toBeNull();
  });
});
