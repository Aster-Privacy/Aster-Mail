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
  DropdownMenuItem: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/profile/sender_address_copy_row", () => ({
  SenderAddressCopyRow: ({ email }: { email: string }) => (
    <span data-testid="address_row">{email}</span>
  ),
}));

const { SystemSenderCard } = await import("./system_sender_card");

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

describe("SystemSenderCard", () => {
  it("shows the name, badge, address, and note without contact actions", () => {
    act(() => {
      root!.render(
        <SystemSenderCard
          is_open
          display_name="Aster Mail"
          email="noreply@astermail.org"
          render_avatar={() => <span data-testid="avatar" />}
          on_copy_email={() => Promise.resolve(true)}
          on_open_change={() => {}}
        >
          <span>Aster Mail</span>
        </SystemSenderCard>,
      );
    });
    const card = container!.querySelector(
      '[data-testid="system_sender_card"]',
    )!;

    expect(card).not.toBeNull();
    expect(card.querySelector('[data-testid="avatar"]')).not.toBeNull();
    expect(
      card.querySelector('[data-testid="sender_card_name"]')!.textContent,
    ).toBe("Aster Mail");
    expect(
      card
        .querySelector('[data-testid="system_sender_badge"]')!
        .getAttribute("src"),
    ).toBe("/official_badge.webp");
    expect(
      card.querySelector('[data-testid="address_row"]')!.textContent,
    ).toBe("noreply@astermail.org");
    expect(
      card.querySelector('[data-testid="system_sender_note"]')!.textContent,
    ).toBe("mail.system_sender_no_replies");
    expect(
      card
        .querySelector('[data-testid="sender_card_email"]')!
        .hasAttribute("data-selectable"),
    ).toBe(true);
    expect(
      card
        .querySelector('[data-testid="sender_card_name"]')!
        .hasAttribute("data-selectable"),
    ).toBe(true);
    const text = card.textContent ?? "";

    for (const key of [
      "common.add_to_contacts",
      "common.notes",
      "common.messages_from_sender",
      "common.send_email",
    ]) {
      expect(text).not.toContain(key);
    }
  });
});
