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
import type { ContactGroup, DecryptedContact } from "@/types/contacts";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { QuickContactsPanel } from "./quick_contacts_panel";

import { clear_contact_groups_cache } from "@/hooks/use_contact_groups";
import * as contacts_api from "@/services/api/contacts";
import * as keys_api from "@/services/api/keys";

const team_group: ContactGroup = {
  id: "g1",
  name: "Team",
  color: "#6366f1",
  contact_count: 1,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const contacts: DecryptedContact[] = [
  {
    id: "c1",
    first_name: "Grouped",
    last_name: "Person",
    emails: ["grouped@example.com"],
    is_favorite: false,
    groups: ["g1"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "c2",
    first_name: "Loose",
    last_name: "Person",
    emails: ["loose@example.com"],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
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

describe("quick contacts panel groups tab", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_panel = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <QuickContactsPanel
            is_open
            is_top_inset={false}
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

  const groups_tab = () =>
    Array.from(container.querySelectorAll('[role="tab"]')).find((tab) =>
      tab.textContent?.startsWith("common.groups"),
    ) as HTMLElement;

  beforeEach(() => {
    clear_contact_groups_cache();
    vi.spyOn(contacts_api, "list_contacts").mockResolvedValue({
      data: { items: [] },
    } as never);
    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue(
      contacts as never,
    );
    vi.spyOn(contacts_api, "list_contact_groups").mockResolvedValue({
      data: { groups: [team_group] },
    } as never);
    vi.spyOn(keys_api, "discover_external_keys_batch").mockResolvedValue({
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

  it("offers a groups tab beside the contacts tab", async () => {
    await render_panel();

    expect(groups_tab()).not.toBeUndefined();
    expect(groups_tab().getAttribute("aria-selected")).toBe("false");
  });

  it("lists every group with its contact count", async () => {
    await render_panel();
    await click(groups_tab());

    expect(groups_tab().getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("Team");
    expect(container.textContent).toContain("common.group_contact_count");
    expect(
      container.querySelector('[aria-label="common.delete_group"]'),
    ).not.toBeNull();
  });

  it("shows only the members of the group you open", async () => {
    await render_panel();
    await click(groups_tab());
    await click(container.querySelector(".quick_contacts_row button")!);

    expect(container.textContent).toContain("Grouped Person");
    expect(container.textContent).not.toContain("Loose Person");
  });

  it("restores every contact when you clear the group", async () => {
    await render_panel();
    await click(groups_tab());
    await click(container.querySelector(".quick_contacts_row button")!);
    await click(container.querySelector(".quick_contacts_notice_link")!);

    expect(container.textContent).toContain("Grouped Person");
    expect(container.textContent).toContain("Loose Person");
  });
});
