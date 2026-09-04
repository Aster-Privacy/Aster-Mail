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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { QuickContactsPanel } from "./quick_contacts_panel";

import * as contacts_api from "@/services/api/contacts";
import * as keys_api from "@/services/api/keys";

const contact: DecryptedContact = {
  id: "c1",
  first_name: "Test",
  last_name: "Person",
  emails: ["person@example.com"],
  phone: "+1 555 0100",
  company: "Example Inc",
  is_favorite: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

let editor_open = false;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: true }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: true } }),
}));

vi.mock("@/components/common/contacts/contact_avatar", () => ({
  ContactAvatar: () => null,
}));

vi.mock("@/components/contacts", () => ({
  ContactForm: ({ is_open }: { is_open: boolean }) => {
    editor_open = is_open;

    return null;
  },
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("quick contacts panel detail view", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_panel = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <QuickContactsPanel
            is_open
            is_top_inset={false}
            on_compose={() => {}}
            on_close={() => {}}
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

  beforeEach(() => {
    vi.spyOn(contacts_api, "list_contacts").mockResolvedValue({
      data: { items: [] },
    } as never);
    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue([
      contact,
    ] as never);
    vi.spyOn(keys_api, "discover_external_keys_batch").mockResolvedValue({
      data: [],
    } as never);
    editor_open = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("opens the contact in the panel instead of the editor", async () => {
    await render_panel();

    const row = container.querySelector(
      ".quick_contacts_row_open",
    ) as HTMLElement;

    expect(row).not.toBeNull();
    await click(row);

    expect(editor_open).toBe(false);
    expect(container.textContent).toContain("person@example.com");
    expect(container.textContent).toContain("+1 555 0100");
    expect(container.textContent).toContain("Example Inc");
    expect(
      container.querySelector('[aria-label="common.back"]'),
    ).not.toBeNull();
  });

  it("returns to the list from the detail view", async () => {
    await render_panel();

    await click(container.querySelector(".quick_contacts_row_open")!);
    await click(container.querySelector('[aria-label="common.back"]')!);

    expect(container.querySelector('[aria-label="common.back"]')).toBeNull();
    expect(
      container.querySelector('[aria-label="common.search_contacts"]'),
    ).not.toBeNull();
  });

  it("lists a discovered encryption key without asking", async () => {
    vi.spyOn(keys_api, "discover_external_keys_batch").mockResolvedValue({
      data: [
        {
          email: "person@example.com",
          found: true,
          public_key: "key",
          fingerprint: "AAAABBBBCCCCDDDDEEEEFFFF00001111",
          source: "wkd",
          expires_at: null,
          will_encrypt: true,
        },
      ],
    } as never);

    await render_panel();
    await click(container.querySelector(".quick_contacts_row_open")!);
    await act(async () => {});

    expect(container.textContent).toContain("AAAA BBBB CCCC");
    expect(container.textContent).toContain("settings.pgp_key_discovered_via");
  });

  it("opens the editor from the detail view edit action", async () => {
    await render_panel();

    await click(container.querySelector(".quick_contacts_row_open")!);
    await click(container.querySelector('[aria-label="common.edit_contact"]')!);

    expect(editor_open).toBe(true);
  });
});
