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
import type { ReactNode } from "react";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

import { ContactList } from "./contact_list";

import * as contacts_api from "@/services/api/contacts";
import { CONTACT_GROUPS_CHANGED_EVENT } from "@/hooks/use_contact_groups";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: false }),
  use_auth_safe: () => ({ has_keys: false }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { auto_save_recent_recipients: false },
    update_preference: () => {},
  }),
}));

vi.mock("@/components/common/contacts/contact_avatar", () => ({
  ContactAvatar: () => null,
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/ui/modal", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  return {
    Modal: ({
      is_open,
      children,
    }: {
      is_open: boolean;
      children?: ReactNode;
    }) => (is_open ? <div role="dialog">{children}</div> : null),
    ModalHeader: Pass,
    ModalTitle: Pass,
    ModalDescription: Pass,
    ModalBody: Pass,
    ModalFooter: Pass,
  };
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function make_contact(
  id: string,
  first_name: string,
  groups: string[],
): DecryptedContact {
  return {
    id,
    first_name,
    last_name: "Example",
    emails: [`${first_name.toLowerCase()}@example.test`],
    is_favorite: false,
    groups,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as DecryptedContact;
}

const contacts: DecryptedContact[] = [
  make_contact("c_zoe", "Zoe", ["g_alpha"]),
  make_contact("c_ana", "Ana", ["g_alpha", "g_alpha"]),
  make_contact("c_bruno", "Bruno", []),
];

const trashed: DecryptedContact[] = [
  make_contact("c_old", "Old", ["g_alpha"]),
];

const alpha: ContactGroup = {
  id: "g_alpha",
  name: "Alpha",
  color: "#3b82f6",
  contact_count: 3,
} as ContactGroup;

const empty_group: ContactGroup = {
  id: "g_empty",
  name: "Empty",
  color: "#10b981",
  contact_count: 0,
} as ContactGroup;

const t = ((key: string, params?: Record<string, string | number>) =>
  params
    ? `${key}(${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(",")})`
    : key) as never;

const noop = () => {};

let current_location = "";
let navigate_ref: ReturnType<typeof useNavigate> | null = null;

function LocationProbe() {
  const location = useLocation();

  navigate_ref = useNavigate();
  current_location = `${location.pathname}${location.search}`;

  return null;
}

describe("contact group member view", () => {
  let container: HTMLDivElement;
  let root: Root;
  let groups_response: ContactGroup[];
  let set_selected_contact: ReturnType<typeof vi.fn>;
  let on_set_group_members: ReturnType<typeof vi.fn>;

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const render_list = async (entry = "/contacts") => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <LocationProbe />
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
            on_set_group_members={on_set_group_members as never}
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
            set_selected_contact={set_selected_contact as never}
            set_sort_by={noop}
            set_view_mode={noop}
            sort_by={"name" as never}
            sort_label=""
            t={t}
            trashed_contacts={trashed}
            upcoming_birthdays_count={0}
            view_mode={"list" as never}
          />
        </MemoryRouter>,
      );
    });
    await flush();
  };

  const by_test_id = (id: string) =>
    container.ownerDocument.querySelector(
      `[data-testid="${id}"]`,
    ) as HTMLElement | null;

  const click = async (element: Element | null) => {
    expect(element).toBeTruthy();
    await act(async () => {
      (element as HTMLElement).click();
    });
    await flush();
  };

  const groups_tab = () =>
    Array.from(container.querySelectorAll('[role="tab"]')).find((tab) =>
      tab.textContent?.startsWith("common.groups"),
    ) as HTMLElement;

  const groups_list_hidden = () =>
    by_test_id("contact_groups_list")!.className.includes("hidden") ||
    !!by_test_id("contact_groups_list")!.closest(".hidden");

  beforeEach(() => {
    groups_response = [alpha, empty_group];
    set_selected_contact = vi.fn();
    on_set_group_members = vi.fn(async () => true);
    vi.spyOn(contacts_api, "list_contact_groups").mockImplementation(
      async () => ({ data: { groups: groups_response } }) as never,
    );
    vi.spyOn(contacts_api, "list_contacts").mockResolvedValue({
      data: { items: [], next_cursor: null, has_more: false },
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

  it("counts only active members on the group row and labels it", async () => {
    await render_list();
    await click(groups_tab());

    const row = by_test_id("contact_group_row_g_alpha")!;

    expect(row.textContent).toContain("common.group_member_count(count=2)");
    expect(row.getAttribute("aria-label")).toBe(
      "common.open_group_label(name=Alpha,count=common.group_member_count(count=2))",
    );
  });

  it("fills the group avatar with the group color and a white icon", async () => {
    await render_list();
    await click(groups_tab());

    const row_avatar = by_test_id("contact_group_row_g_alpha")!.querySelector(
      '[data-testid="contact_group_avatar"]',
    ) as HTMLElement;

    expect(row_avatar.style.backgroundColor).toBe("#3b82f6");
    expect(row_avatar.style.color).toBe("#ffffff");

    await click(by_test_id("contact_group_row_g_alpha"));

    const header_avatar = by_test_id("contact_group_view")!.querySelector(
      '[data-testid="contact_group_avatar"]',
    ) as HTMLElement;

    expect(header_avatar.style.backgroundColor).toBe("#3b82f6");
    expect(header_avatar.style.color).toBe("#ffffff");
  });

  it("opens a group, lists its members, and opens a member", async () => {
    await render_list();
    await click(groups_tab());
    await click(by_test_id("contact_group_row_g_alpha"));

    expect(current_location).toBe("/contacts?group_view=g_alpha");
    expect(by_test_id("contact_group_title")!.textContent).toBe("Alpha");
    expect(by_test_id("contact_group_count")!.textContent).toBe(
      "common.group_member_count(count=2)",
    );

    const member_rows = Array.from(
      container.querySelectorAll('[data-testid^="contact_group_member_"]'),
    ).map((row) => row.getAttribute("data-testid"));

    expect(member_rows).toEqual([
      "contact_group_member_c_ana",
      "contact_group_member_c_zoe",
    ]);
    expect(by_test_id("contact_group_member_c_old")).toBeNull();
    expect(by_test_id("contact_group_member_c_bruno")).toBeNull();

    await click(
      by_test_id("contact_group_member_c_zoe")!.querySelector("button"),
    );
    expect(set_selected_contact).toHaveBeenCalledWith(contacts[0]);
    expect(by_test_id("contact_group_view")).toBeTruthy();
  });

  it("returns to the Groups tab with the in-app back control", async () => {
    await render_list();
    await click(groups_tab());
    await click(by_test_id("contact_group_row_g_alpha"));
    await click(by_test_id("contact_group_back"));

    expect(current_location).toBe("/contacts");
    expect(by_test_id("contact_group_view")).toBeNull();
    expect(groups_tab().getAttribute("aria-selected")).toBe("true");
    expect(groups_list_hidden()).toBe(false);
    expect(container.ownerDocument.activeElement).toBe(
      by_test_id("contact_group_row_g_alpha"),
    );
  });

  it("returns to the Groups tab on browser back", async () => {
    await render_list();
    await click(groups_tab());
    await click(by_test_id("contact_group_row_g_alpha"));
    expect(by_test_id("contact_group_view")).toBeTruthy();

    await act(async () => {
      navigate_ref!(-1);
    });
    await flush();

    expect(current_location).toBe("/contacts");
    expect(by_test_id("contact_group_view")).toBeNull();
    expect(groups_tab().getAttribute("aria-selected")).toBe("true");
  });

  it("restores the group view from the URL", async () => {
    await render_list("/contacts?group_view=g_alpha");

    expect(groups_tab().getAttribute("aria-selected")).toBe("true");
    expect(by_test_id("contact_group_title")!.textContent).toBe("Alpha");

    await click(by_test_id("contact_group_back"));
    expect(current_location).toBe("/contacts");
    expect(groups_tab().getAttribute("aria-selected")).toBe("true");
  });

  it("drops the group view when another tab is chosen", async () => {
    await render_list("/contacts?group_view=g_alpha");

    const contacts_tab = Array.from(
      container.querySelectorAll('[role="tab"]'),
    ).find((tab) => tab.textContent?.startsWith("common.contacts"))!;

    await click(contacts_tab);
    expect(current_location).toBe("/contacts");
  });

  it("offers to add members to an empty group", async () => {
    await render_list();
    await click(groups_tab());
    await click(by_test_id("contact_group_row_g_empty"));

    expect(by_test_id("contact_group_empty")!.textContent).toContain(
      "common.group_empty_add_hint",
    );
    await click(by_test_id("contact_group_empty_add"));

    const option = by_test_id("contact_group_add_option_c_bruno")!;

    expect(option).toBeTruthy();
    await click(option.querySelector('button, input[type="checkbox"]'));
    await click(by_test_id("contact_group_add_confirm"));

    expect(on_set_group_members).toHaveBeenCalledWith(
      "g_empty",
      ["c_bruno"],
      true,
    );
  });

  it("closes the view when the group is deleted elsewhere", async () => {
    await render_list();
    await click(groups_tab());
    await click(by_test_id("contact_group_row_g_alpha"));
    expect(by_test_id("contact_group_view")).toBeTruthy();

    groups_response = [empty_group];
    await act(async () => {
      window.dispatchEvent(new Event(CONTACT_GROUPS_CHANGED_EVENT));
      window.dispatchEvent(new Event("focus"));
    });
    await flush();

    expect(by_test_id("contact_group_view")).toBeNull();
    expect(current_location).toBe("/contacts");
    expect(groups_tab().getAttribute("aria-selected")).toBe("true");
    expect(by_test_id("contact_group_row_g_alpha")).toBeNull();
  });

  it("keeps row delete from opening the group", async () => {
    await render_list();
    await click(groups_tab());
    await click(by_test_id("contact_group_row_delete_g_alpha"));

    expect(by_test_id("contact_group_view")).toBeNull();
    expect(current_location).toBe("/contacts");
  });

  it("keeps one primary action and moves the rest into the overflow menu", async () => {
    await render_list();
    await click(groups_tab());
    await click(by_test_id("contact_group_row_g_alpha"));

    expect(by_test_id("contact_group_add")!.textContent).toContain(
      "common.add_members",
    );
    expect(by_test_id("contact_group_edit")).toBeNull();
    expect(by_test_id("contact_group_delete")).toBeNull();

    const trigger = by_test_id("contact_group_menu")!;

    expect(trigger.getAttribute("aria-label")).toBe("common.more_actions");
    await act(async () => {
      trigger.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });
    await flush();

    expect(by_test_id("contact_group_email")).toBeTruthy();
    expect(by_test_id("contact_group_edit")).toBeTruthy();
    expect(by_test_id("contact_group_delete")).toBeTruthy();
  });

  it("marks a picked contact as selected in the add members dialog", async () => {
    await render_list();
    await click(groups_tab());
    await click(by_test_id("contact_group_row_g_alpha"));
    await click(by_test_id("contact_group_add"));

    const option = by_test_id("contact_group_add_option_c_bruno")!;

    expect(option.getAttribute("data-checked")).toBe("false");
    await click(option.querySelector('button, input[type="checkbox"]'));
    expect(
      by_test_id("contact_group_add_option_c_bruno")!.getAttribute(
        "data-checked",
      ),
    ).toBe("true");
    expect(by_test_id("contact_group_add_confirm")!.textContent).toBe(
      "common.add_members_count(count=1)",
    );
  });
});
