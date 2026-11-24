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
import type { ExistingPin } from "./contact_pick";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ContactPickModal } from "./contact_pick_modal";

import { I18nProvider } from "@/lib/i18n/context";
import { list_all_contacts, decrypt_contacts } from "@/services/api/contacts";
import { show_toast } from "@/components/toast/simple_toast";

vi.mock("@/services/api/contacts", () => ({
  list_all_contacts: vi.fn(),
  decrypt_contacts: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/common/contacts/contact_avatar", () => ({
  ContactAvatar: ({ name }: { name: string }) => (
    <span data-testid="avatar">{name}</span>
  ),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ is_open, children }: { is_open: boolean; children?: unknown }) =>
    is_open ? <div data-testid="modal">{children as never}</div> : null,
  ModalHeader: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalTitle: ({ children }: { children?: unknown }) => (
    <h2>{children as never}</h2>
  ),
  ModalDescription: ({ children }: { children?: unknown }) => (
    <p>{children as never}</p>
  ),
  ModalBody: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalFooter: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
}));

function make_contact(
  overrides: Partial<DecryptedContact> & { id: string },
): DecryptedContact {
  return {
    first_name: "",
    last_name: "",
    emails: [],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as DecryptedContact;
}

const CONTACTS = [
  make_contact({
    id: "c1",
    first_name: "Ada",
    last_name: "Lovelace",
    emails: ["ada@example.com", "ada@work.example"],
    email_entries: [
      { value: "ada@example.com", type: "personal" },
      { value: "ada@work.example", type: "work" },
    ],
  }),
  make_contact({ id: "c2", first_name: "Bob", emails: ["bob@example.org"] }),
  make_contact({ id: "c3", first_name: "Cleo", emails: ["cleo@example.net"] }),
  make_contact({ id: "c4", first_name: "Phone only" }),
];

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

interface RenderOptions {
  pins?: ExistingPin[];
  on_add?: (address: string) => Promise<{ error?: unknown }>;
  on_close?: () => void;
  on_finished?: () => void;
}

async function render_modal(options: RenderOptions = {}) {
  await act(async () => {
    root.render(
      <I18nProvider default_language="en">
        <ContactPickModal
          is_open
          on_add={options.on_add ?? (async () => ({}))}
          on_close={options.on_close ?? (() => {})}
          on_finished={options.on_finished ?? (() => {})}
          pins={options.pins ?? []}
        />
      </I18nProvider>,
    );
  });
  await flush();
}

function by_test_id(id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

function option_checkbox(address: string): HTMLInputElement | null {
  return (
    by_test_id(`alias_pick_option_${address}`)?.querySelector("input") ?? null
  );
}

async function click(element: Element | null) {
  if (!element) throw new Error("missing element");
  await act(async () => {
    (element as HTMLElement).click();
  });
  await flush();
}

async function type_search(value: string) {
  const input = by_test_id("alias_pick_search") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}

function submit_button(): HTMLButtonElement {
  return by_test_id("alias_pick_submit") as HTMLButtonElement;
}

beforeEach(() => {
  vi.mocked(list_all_contacts).mockResolvedValue({ data: [] } as never);
  vi.mocked(decrypt_contacts).mockResolvedValue(CONTACTS);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

describe("ContactPickModal", () => {
  it("lists contacts with an address and lets each address of a contact be chosen", async () => {
    await render_modal();

    expect(by_test_id("alias_pick_group_c1")).not.toBeNull();
    expect(option_checkbox("ada@example.com")).not.toBeNull();
    expect(option_checkbox("ada@work.example")).not.toBeNull();
    expect(option_checkbox("bob@example.org")).not.toBeNull();
    expect(container.textContent).not.toContain("Phone only");
    expect(container.textContent).toContain("2 addresses");
    expect(container.textContent).toContain("Work");
    expect(submit_button().disabled).toBe(true);
  });

  it("marks senders that are already listed or blocked and skips them", async () => {
    const on_add = vi.fn(async (_address: string) => ({}));

    await render_modal({
      on_add,
      pins: [
        { sender: "Bob@Example.org", is_blocked: false },
        { sender: "cleo@example.net", is_blocked: true },
      ],
    });

    expect(option_checkbox("bob@example.org")).toBeNull();
    expect(
      by_test_id("alias_pick_option_bob@example.org")?.textContent,
    ).toContain("Already added");
    expect(
      by_test_id("alias_pick_option_cleo@example.net")?.textContent,
    ).toContain("Blocked");

    await click(
      by_test_id("alias_pick_select_all")?.querySelector("input") ?? null,
    );
    expect(by_test_id("alias_pick_selected_count")?.textContent).toBe(
      "1 selected",
    );
    await click(submit_button());

    expect(on_add).toHaveBeenCalledTimes(1);
    expect(on_add).toHaveBeenCalledWith("ada@example.com");
  });

  it("adds the chosen addresses, reloads the list, and closes", async () => {
    const on_add = vi.fn(async (_address: string) => ({}));
    const on_finished = vi.fn();
    const on_close = vi.fn();

    await render_modal({ on_add, on_finished, on_close });
    await click(option_checkbox("ada@work.example"));
    await click(option_checkbox("bob@example.org"));

    expect(submit_button().textContent).toContain("Add 2 senders");
    await click(submit_button());

    expect(on_add.mock.calls.map((call) => call[0]).sort()).toEqual([
      "ada@work.example",
      "bob@example.org",
    ]);
    expect(on_finished).toHaveBeenCalledTimes(1);
    expect(on_close).toHaveBeenCalledTimes(1);
    expect(show_toast).toHaveBeenCalledWith("Added 2 senders", "success");
  });

  it("keeps failed addresses selected after a partial failure", async () => {
    const on_add = vi.fn(async (address: string) =>
      address === "bob@example.org" ? { error: "rate limited" } : {},
    );
    const on_close = vi.fn();

    await render_modal({ on_add, on_close });
    await click(option_checkbox("ada@example.com"));
    await click(option_checkbox("bob@example.org"));
    await click(submit_button());

    expect(on_close).not.toHaveBeenCalled();
    expect(show_toast).toHaveBeenCalledWith(
      "Added 1 of 2 senders. The rest are still selected, so you can try again.",
      "error",
    );
    expect(option_checkbox("bob@example.org")?.checked).toBe(true);
    expect(option_checkbox("ada@example.com")?.checked).toBe(false);
    expect(submit_button().textContent).toContain("Add 1 sender");
  });

  it("filters by name or address", async () => {
    await render_modal();
    await type_search("work.ex");

    expect(option_checkbox("ada@work.example")).not.toBeNull();
    expect(option_checkbox("bob@example.org")).toBeNull();

    await type_search("nobody");
    expect(container.textContent).toContain("No contacts match");
  });

  it("select all applies only to the filtered contacts", async () => {
    await render_modal();
    await type_search("bob");
    await click(
      by_test_id("alias_pick_select_all")?.querySelector("input") ?? null,
    );
    await type_search("");

    expect(option_checkbox("bob@example.org")?.checked).toBe(true);
    expect(option_checkbox("cleo@example.net")?.checked).toBe(false);
  });

  it("shows an empty state when no contact has an email address", async () => {
    vi.mocked(decrypt_contacts).mockResolvedValue([
      make_contact({ id: "x", first_name: "Phone only" }),
    ]);
    await render_modal();

    expect(by_test_id("alias_pick_no_contacts")?.textContent).toContain(
      "No contacts with an email address",
    );
  });

  it("says so when every contact is already on the list", async () => {
    await render_modal({
      pins: [
        { sender: "ada@example.com", is_blocked: false },
        { sender: "ada@work.example", is_blocked: false },
        { sender: "bob@example.org", is_blocked: false },
        { sender: "cleo@example.net", is_blocked: false },
      ],
    });

    expect(by_test_id("alias_pick_all_added")).not.toBeNull();
    expect(by_test_id("alias_pick_select_all")).toBeNull();
    expect(by_test_id("alias_pick_selected_count")).toBeNull();
    expect(
      (by_test_id("alias_pick_submit") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows a retry notice when contacts fail to load", async () => {
    vi.mocked(list_all_contacts).mockResolvedValueOnce({
      error: "offline",
    } as never);
    await render_modal();

    expect(by_test_id("alias_pick_list")).toBeNull();
    const retry = [...container.querySelectorAll("button")].find((button) =>
      /retry|try again/i.test(button.textContent ?? ""),
    );

    await click(retry ?? null);
    expect(by_test_id("alias_pick_list")).not.toBeNull();
  });

  it("caps a selection at 200 senders", async () => {
    vi.mocked(decrypt_contacts).mockResolvedValue(
      Array.from({ length: 450 }, (_, i) =>
        make_contact({
          id: `m${i}`,
          first_name: `Person ${String(i).padStart(3, "0")}`,
          emails: [`p${i}@example.com`],
        }),
      ),
    );
    await render_modal();
    await click(
      by_test_id("alias_pick_select_all")?.querySelector("input") ?? null,
    );

    expect(by_test_id("alias_pick_selected_count")?.textContent).toBe(
      "200 selected",
    );
    expect(by_test_id("alias_pick_limit")).not.toBeNull();
    expect(submit_button().textContent).toContain("Add 200 senders");

    await click(
      by_test_id("alias_pick_select_all")?.querySelector("input") ?? null,
    );

    expect(by_test_id("alias_pick_selected_count")?.textContent).toBe(
      "0 selected",
    );
    expect(by_test_id("alias_pick_limit")).toBeNull();
  });
});
