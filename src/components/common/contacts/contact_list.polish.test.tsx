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
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { ContactList } from "./contact_list";

import * as contacts_api from "@/services/api/contacts";

const update_preference = vi.fn();
let auto_save = false;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: false }),
  use_auth_safe: () => ({ has_keys: false }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { auto_save_recent_recipients: auto_save },
    update_preference,
  }),
}));

vi.mock("@/components/common/contacts/contact_avatar", () => ({
  ContactAvatar: () => null,
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const base_contacts: DecryptedContact[] = ["Ana", "Bruno"].map((name, i) => ({
  id: `c${i}`,
  first_name: name,
  last_name: "Exemplo",
  emails: [`${name.toLowerCase()}@example.test`],
  is_favorite: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
})) as DecryptedContact[];

const noop = () => {};
let upcoming = 0;

const duplicate_contacts: DecryptedContact[] = [
  ...base_contacts,
  { ...base_contacts[0], id: "c_dup" } as DecryptedContact,
];

describe("contact list page polish", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_list = async (contacts: DecryptedContact[]) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ContactList
            alphabetical_index={new Map()}
            contact_refs={{ current: new Map() }}
            contacts={contacts}
            copied_field={null}
            error={null}
            filter_by={"all" as never}
            filter_label=""
            filtered_contacts={contacts}
            focused_index={-1}
            group_filter={null}
            has_selection={false}
            is_loading={false}
            list_container_ref={createRef<HTMLDivElement>() as never}
            on_add_click={noop}
            on_add_selected_to_group={noop}
            on_bulk_create={async () => {}}
            on_compose_email={noop}
            on_compose_to_recipients={noop}
            on_compose_to_selected={noop}
            on_contacts_refresh={noop}
            on_copy={noop}
            on_copy_emails={noop}
            on_delete_forever={noop}
            on_delete_selected={noop}
            on_empty_trash={noop}
            on_export_contacts={noop}
            on_import_modal_open={noop}
            on_mobile_menu_toggle={noop}
            on_print_contacts={noop}
            on_restore_contact={noop}
            on_scroll_to_letter={noop}
            on_set_group_filter={noop}
            on_set_group_membership={noop}
            on_toggle_favorite_selected={noop}
            on_toggle_select={noop}
            on_toggle_select_all={noop}
            search_query=""
            selected_all_favorited={false}
            selected_contact={null}
            selected_contacts={[]}
            selected_ids={new Set()}
            selection_state={{
              selected_count: 0,
              all_selected: false,
              some_selected: false,
            }}
            set_filter_by={noop}
            set_selected_contact={noop}
            set_sort_by={noop}
            set_view_mode={noop}
            sort_by={"name" as never}
            sort_label=""
            t={((key: string) => key) as never}
            trashed_contacts={[]}
            upcoming_birthdays_count={upcoming}
            view_mode={"list" as never}
          />
        </MemoryRouter>,
      );
    });
  };

  beforeEach(() => {
    upcoming = 0;
    localStorage.clear();
    vi.spyOn(contacts_api, "list_contact_groups").mockResolvedValue({
      data: { groups: [] },
    } as never);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const notice_for = (text: string) =>
    Array.from(container.querySelectorAll(".contact_list_notice")).find(
      (row) => row.textContent?.includes(text),
    ) as HTMLElement | undefined;

  it("shows duplicates as a plain row without a tinted background", async () => {
    await render_list(duplicate_contacts);

    const notice = notice_for("common.duplicates_found");

    expect(notice).toBeTruthy();
    expect(container.querySelector(".aster_island_tone_accent")).toBeNull();
    expect(notice!.textContent).toContain("common.duplicates_found_hint");
    expect(
      notice!.querySelector("button[aria-label='common.review_duplicates']"),
    ).toBeTruthy();
  });

  it("keeps the birthday notice icon and close button neutral", async () => {
    await render_list(base_contacts);

    const notice = notice_for("common.add_birthdays");

    expect(notice).toBeTruthy();
    expect(notice!.innerHTML).not.toContain("accent-color");
    expect(notice!.innerHTML).not.toContain("quick_contacts_notice_link");

    const close = notice!.querySelector(
      "button[aria-label='common.dismiss']",
    ) as HTMLButtonElement;

    expect(close.className).toContain("contact_list_icon_button");
  });

  it("shows the contact count beside select all when nothing is selected", async () => {
    await render_list(base_contacts);

    const header = container.querySelector(".contact_list_header")!;

    expect(header).toBeTruthy();
    expect(header.querySelector(".contact_list_header_label")!.textContent).toBe(
      "common.contact_count",
    );
  });

  it("keeps the encryption badge next to the page title", async () => {
    await render_list(base_contacts);

    const title = container.querySelector(".contact_list_title")!;

    expect(title).toBeTruthy();
    expect(title.querySelector("h1")!.textContent).toBe("common.contacts");
    expect(title.querySelector(".contact_encryption_info")).toBeTruthy();
  });

  it("uses neutral tabs with no raised shadow", async () => {
    await render_list(base_contacts);

    const tabs = Array.from(container.querySelectorAll("[role='tab']"));

    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) {
      expect(tab.className).toContain("contact_list_tab");
      expect(tab.className).not.toContain("shadow");
    }
  });
});
