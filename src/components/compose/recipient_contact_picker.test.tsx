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
import type { DecryptedContact } from "@/types/contacts";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipientContactPicker } from "./recipient_contact_picker";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));
vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

const contact = (
  id: string,
  first_name: string,
  emails: string[],
  extra: Partial<DecryptedContact> = {},
): DecryptedContact => ({
  id,
  first_name,
  last_name: "",
  emails,
  is_favorite: false,
  created_at: "",
  updated_at: "",
  ...extra,
});
const contacts = [
  contact("a", "Alice", ["alice@example.com", "alice.work@example.com"]),
  contact("b", "Bob", ["bob@example.com"]),
  contact("duplicate", "Duplicate", ["ALICE@example.com"]),
  contact("invalid", "Invalid", ["", "invalid"]),
  contact("trashed", "Trashed", ["trash@example.com"], {
    deleted_at: "2026-10-01",
  }),
];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function click(element: Element | null) {
  expect(element).not.toBeNull();
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
function button(text: string) {
  return (
    [...document.querySelectorAll("button")].find(
      (element) => element.textContent === text,
    ) ?? null
  );
}
function render_picker(label = "To", existing_recipients: string[] = []) {
  const on_add_recipient = vi.fn();

  act(() => {
    root.render(
      <RecipientContactPicker
        contacts={contacts}
        existing_recipients={existing_recipients}
        label={label}
        on_add_recipient={on_add_recipient}
      />,
    );
  });
  container.querySelector("button")?.focus();
  click(container.querySelector("button"));

  return on_add_recipient;
}

describe("compose contact picker", () => {
  it.each(["To", "CC", "BCC"])(
    "adds selected emails from the %s picker",
    (label) => {
      const on_add = render_picker(label, ["BOB@example.com"]);
      const dialog = document.querySelector('[role="dialog"]');

      expect(dialog?.textContent).toContain(label);
      const checkboxes = [
        ...dialog!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      ];

      expect(checkboxes).toHaveLength(3);
      expect(checkboxes[2].disabled).toBe(true);
      expect(button("common.add")?.hasAttribute("disabled")).toBe(true);
      click(checkboxes[0]);
      click(checkboxes[1]);
      click(button("common.add"));
      expect(on_add.mock.calls).toEqual([
        ["alice@example.com"],
        ["alice.work@example.com"],
      ]);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    },
  );

  it("filters contacts and resets selections after cancelling", () => {
    const on_add = render_picker();

    click(document.querySelector('input[type="checkbox"]'));
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="common.search_contacts"]',
    )!;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;

      setter.call(input, "bob");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "bob@example.com",
    );
    click(document.querySelector('input[type="checkbox"]'));
    click(button("common.cancel"));
    expect(on_add).not.toHaveBeenCalled();
    click(container.querySelector("button"));
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="common.search_contacts"]',
      )?.value,
    ).toBe("");
    expect(button("common.add")?.hasAttribute("disabled")).toBe(true);
  });

  it("closes only the picker on Escape and restores focus to its button", () => {
    render_picker();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("button"));
  });
});
