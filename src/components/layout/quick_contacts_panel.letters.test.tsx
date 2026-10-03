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

import { clear_contact_groups_cache } from "@/hooks/use_contact_groups";
import * as contacts_api from "@/services/api/contacts";
import * as keys_api from "@/services/api/keys";

function make_contact(id: string, first_name: string): DecryptedContact {
  return {
    id,
    first_name,
    last_name: "",
    emails: [`${id}@example.com`],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const contacts: DecryptedContact[] = [
  make_contact("c1", "Óscar"),
  make_contact("c2", "Amélia"),
  make_contact("c3", "Bruno"),
  make_contact("c4", "Álvaro"),
  make_contact("c5", "42 Club"),
  make_contact("c6", "Élio"),
  make_contact("c7", "Alberto"),
  make_contact("c8", "Ângela"),
];

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

vi.mock("@/components/contacts", () => ({
  ContactForm: () => null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("quick contacts panel letter headers", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clear_contact_groups_cache();
    vi.spyOn(contacts_api, "list_contacts").mockResolvedValue({
      data: { items: [] },
    } as never);
    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue(
      contacts as never,
    );
    vi.spyOn(contacts_api, "list_contact_groups").mockResolvedValue({
      data: { groups: [] },
    } as never);
    vi.spyOn(keys_api, "discover_contact_keys_batch").mockResolvedValue({
      data: [],
    } as never);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    clear_contact_groups_cache();
    vi.restoreAllMocks();
  });

  it("files accented names under their base letter without repeating headers", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <QuickContactsPanel
            is_open
            is_swapping={false}
            on_close={() => {}}
            on_compose={() => {}}
          />
        </MemoryRouter>,
      );
    });

    const sections = Array.from(container.querySelectorAll("section")).map(
      (section) => ({
        letter: section.querySelector("p")?.textContent,
        names: Array.from(section.querySelectorAll(".quick_contacts_row")).map(
          (row) =>
            contacts.find((c) => row.textContent?.includes(c.first_name))
              ?.first_name,
        ),
      }),
    );

    expect(sections.map((section) => section.letter)).toEqual([
      "#",
      "A",
      "B",
      "E",
      "O",
    ]);
    expect(sections[1].names).toEqual([
      "Alberto",
      "Álvaro",
      "Amélia",
      "Ângela",
    ]);
  });
});
