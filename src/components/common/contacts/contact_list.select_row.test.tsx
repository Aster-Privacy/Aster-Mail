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

const contacts: DecryptedContact[] = ["Ana", "Bruno"].map((name, i) => ({
  id: `c${i}`,
  first_name: name,
  last_name: "Exemplo",
  emails: [`${name.toLowerCase()}@example.test`],
  is_favorite: false,
  birthday: "1990-01-01",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
})) as DecryptedContact[];

const noop = () => {};

describe("contact list select-all and auto-save rows", () => {
  let container: HTMLDivElement;
  let root: Root;
  let on_toggle_select_all: ReturnType<typeof vi.fn<() => void>>;

  const render_list = async () => {
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
            on_toggle_select_all={on_toggle_select_all}
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
            upcoming_birthdays_count={0}
            view_mode={"list" as never}
          />
        </MemoryRouter>,
      );
    });
  };

  const label_for = (text: string) =>
    Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent === text,
    ) as HTMLLabelElement;

  const control_for = (text: string) => {
    const label = label_for(text);

    return label.htmlFor
      ? (container.ownerDocument.getElementById(
          label.htmlFor,
        ) as HTMLInputElement)
      : null;
  };

  const click = async (element: Element) => {
    await act(async () => {
      (element as HTMLElement).click();
    });
  };

  beforeEach(() => {
    auto_save = false;
    update_preference.mockReset();
    on_toggle_select_all = vi.fn<() => void>();
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

  it("labels select-all and the auto-save switch as separate controls", async () => {
    await render_list();

    const select_all = control_for("common.select_all");
    const auto_save_switch = control_for(
      "settings.auto_save_recipients_to_contacts",
    );

    expect(select_all).toBeTruthy();
    expect(auto_save_switch).toBeTruthy();
    expect(select_all).not.toBe(auto_save_switch);
    expect(select_all!.getAttribute("role")).toBeNull();
    expect(auto_save_switch!.getAttribute("role")).toBe("switch");
    expect(auto_save_switch!.getAttribute("aria-checked")).toBe("false");
    expect(
      label_for("settings.auto_save_recipients_to_contacts").contains(
        select_all,
      ),
    ).toBe(false);
    expect(select_all!.closest("div")!.contains(auto_save_switch)).toBe(false);
  });

  it("reflects the saved setting on the switch", async () => {
    auto_save = true;
    await render_list();

    const auto_save_switch = control_for(
      "settings.auto_save_recipients_to_contacts",
    )!;

    expect(auto_save_switch.checked).toBe(true);
    expect(auto_save_switch.getAttribute("aria-checked")).toBe("true");
  });

  it("toggles the setting, not the selection, when its label is clicked", async () => {
    await render_list();

    await click(label_for("settings.auto_save_recipients_to_contacts"));

    expect(update_preference).toHaveBeenCalledTimes(1);
    expect(update_preference).toHaveBeenCalledWith(
      "auto_save_recent_recipients",
      true,
      true,
    );
    expect(on_toggle_select_all).not.toHaveBeenCalled();
  });

  it("selects all from the checkbox and from its label", async () => {
    await render_list();

    await click(control_for("common.select_all")!);
    await click(label_for("common.select_all"));

    expect(on_toggle_select_all).toHaveBeenCalledTimes(2);
    expect(update_preference).not.toHaveBeenCalled();
  });
});
