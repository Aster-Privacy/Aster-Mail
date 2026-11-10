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
import type { ContactFormData, DecryptedContact } from "@/types/contacts";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { QuickContactsPanel } from "./quick_contacts_panel";
import { PANEL_TRANSITION_MS } from "./use_panel_transition";

import * as contacts_api from "@/services/api/contacts";
import * as keys_api from "@/services/api/keys";
import { emit_contacts_changed } from "@/hooks/mail_events";

const toast = vi.hoisted(() => vi.fn());
const form = vi.hoisted(() => ({
  is_open: false,
  submit: null as null | ((data: ContactFormData) => Promise<void>),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: true }),
  use_auth_safe: () => ({ has_keys: true }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: true } }),
}));

vi.mock("@/components/common/contacts/contact_avatar", () => ({
  ContactAvatar: () => null,
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: toast }));

vi.mock("@/components/contacts", () => ({
  ContactForm: ({
    is_open,
    on_submit,
  }: {
    is_open: boolean;
    on_submit: (data: ContactFormData) => Promise<void>;
  }) => {
    form.is_open = is_open;
    form.submit = on_submit;

    return null;
  },
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function is_in_document(node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parentNode) {
    if (current === document) return true;
  }

  return false;
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  targets: Element[] = [];
  disconnected = false;

  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  takeRecords() {
    return [];
  }

  attached_targets() {
    return this.targets.filter(is_in_document);
  }

  intersect() {
    this.callback(
      this.attached_targets().map(
        (target) =>
          ({ target, isIntersecting: true }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }

  static live() {
    return FakeIntersectionObserver.instances.filter(
      (observer) =>
        !observer.disconnected && observer.attached_targets().length > 0,
    );
  }
}

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function make_contacts(count: number): DecryptedContact[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    first_name: `${letters[Math.floor(index / 6) % 26]}${String(index).padStart(3, "0")}`,
    last_name: "Person",
    emails: [`person${index}@example.com`],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
}

describe("quick contacts panel loading and saving", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_panel = async (is_open = true) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <QuickContactsPanel
            is_open={is_open}
            is_swapping={false}
            on_close={() => {}}
            on_compose={() => {}}
          />
        </MemoryRouter>,
      );
    });
  };

  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  const rows = () => container.querySelectorAll(".quick_contacts_row_open");

  const scroll_to_end = async () => {
    for (let step = 0; step < 20; step += 1) {
      const live = FakeIntersectionObserver.live();

      if (live.length === 0) return;
      await act(async () => {
        live.forEach((observer) => observer.intersect());
      });
    }
  };

  const scroll_one_page = async () => {
    await act(async () => {
      FakeIntersectionObserver.live().forEach((observer) =>
        observer.intersect(),
      );
    });
  };

  const open_editor_for_first_row = async () => {
    await click(rows()[0]);
    await click(container.querySelector('[aria-label="common.edit_contact"]')!);
  };

  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.spyOn(contacts_api, "list_contacts").mockResolvedValue({
      data: { items: [], has_more: false },
    } as never);
    vi.spyOn(contacts_api, "list_contact_groups").mockResolvedValue({
      data: { groups: [] },
    } as never);
    vi.spyOn(contacts_api, "is_contact_in_trash").mockResolvedValue(false);
    vi.spyOn(keys_api, "discover_contact_keys_batch").mockResolvedValue({
      data: [],
    } as never);
    toast.mockReset();
    form.is_open = false;
    form.submit = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders every contact after opening and closing a contact", async () => {
    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue(
      make_contacts(155) as never,
    );
    await render_panel();

    expect(rows().length).toBe(40);

    await scroll_one_page();
    expect(rows().length).toBe(80);

    await click(rows()[0]);
    await click(container.querySelector('[aria-label="common.back"]')!);
    await scroll_to_end();

    expect(rows().length).toBe(155);
  });

  it("renders every contact after the panel closes and reopens", async () => {
    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue(
      make_contacts(155) as never,
    );
    await render_panel();
    await scroll_one_page();
    expect(rows().length).toBe(80);
    await render_panel(false);
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, PANEL_TRANSITION_MS + 20),
      );
    });
    await render_panel(true);
    await scroll_to_end();

    expect(rows().length).toBe(155);
  });

  it("shows a saved edit at once without waiting for a reload", async () => {
    const contact: DecryptedContact = {
      ...make_contacts(1)[0],
      emails: ["first@example.com", "second@example.com"],
    };

    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue([
      contact,
    ] as never);
    const update = vi
      .spyOn(contacts_api, "update_contact_encrypted")
      .mockResolvedValue({ data: { success: true } } as never);

    await render_panel();
    await open_editor_for_first_row();
    expect(form.is_open).toBe(true);

    vi.spyOn(contacts_api, "list_contacts").mockReturnValue(
      new Promise(() => {}) as never,
    );
    await act(async () => {
      await form.submit!({
        first_name: contact.first_name,
        last_name: contact.last_name,
        emails: ["first@example.com"],
      });
    });

    expect(update).toHaveBeenCalledTimes(1);
    const sent = update.mock.calls[0][1];

    expect(sent.emails).toEqual(["first@example.com"]);
    expect(sent.revisions?.[0]?.data.emails).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
    expect(form.is_open).toBe(false);
    expect(container.textContent).toContain("first@example.com");
    expect(container.textContent).not.toContain("second@example.com");
    expect(toast).not.toHaveBeenCalled();
  });

  it("keeps the list and the editor open when a save fails", async () => {
    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue(
      make_contacts(3) as never,
    );
    vi.spyOn(contacts_api, "update_contact_encrypted").mockResolvedValue({
      error: "save failed",
    } as never);

    await render_panel();
    await open_editor_for_first_row();
    await act(async () => {
      await form.submit!({
        first_name: "Renamed",
        last_name: "Person",
        emails: [],
      });
    });

    expect(toast).toHaveBeenCalledWith("save failed", "error");
    expect(form.is_open).toBe(true);
    await click(container.querySelector('[aria-label="common.back"]')!);
    expect(rows().length).toBe(3);
  });

  it("keeps the loaded list when a background reload fails", async () => {
    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue(
      make_contacts(3) as never,
    );
    await render_panel();
    expect(rows().length).toBe(3);

    vi.spyOn(contacts_api, "list_contacts").mockResolvedValue({
      error: "offline",
    } as never);
    await act(async () => {
      emit_contacts_changed();
    });

    expect(rows().length).toBe(3);
    expect(container.textContent).not.toContain("offline");
  });
});
