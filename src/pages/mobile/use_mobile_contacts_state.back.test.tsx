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

import { use_mobile_contacts_state } from "./use_mobile_contacts_state";

import * as contacts_api from "@/services/api/contacts";

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
  make_contact("j1", "Jarvis"),
  make_contact("j2", "Jarvisa"),
  { ...make_contact("a1", "Alice"), is_favorite: true },
  { ...make_contact("b1", "Bruno"), is_favorite: true },
];

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/utils/contact_group_membership", () => ({
  apply_server_group_membership: async (list: DecryptedContact[]) => list,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ContactsState = ReturnType<typeof use_mobile_contacts_state>;

function wait_for_popstate(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener("popstate", () => resolve(), { once: true });
  });
}

async function go_back(): Promise<void> {
  await act(async () => {
    const popped = wait_for_popstate();

    window.history.back();
    await popped;
  });
}

describe("mobile contacts back navigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: ContactsState;

  function Probe() {
    state = use_mobile_contacts_state(() => {});

    return null;
  }

  async function open_jarvis_from_search(): Promise<void> {
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      state.set_search_query("Jarvis");
    });
    expect(state.filtered_contacts.map((c) => c.id)).toEqual(["j1", "j2"]);
    await act(async () => {
      state.handle_contact_press(contacts[0]);
    });
    expect(state.selected_contact?.id).toBe("j1");
  }

  beforeEach(() => {
    window.history.replaceState(null, "", "/inbox");
    window.history.pushState(null, "", "/contacts");
    vi.spyOn(contacts_api, "list_all_contacts").mockResolvedValue({
      data: [],
    } as never);
    vi.spyOn(contacts_api, "decrypt_contacts").mockResolvedValue(
      contacts as never,
    );
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

  it("browser back from a contact returns to the same search results", async () => {
    await open_jarvis_from_search();

    await go_back();

    expect(window.location.pathname).toBe("/contacts");
    expect(state.selected_contact).toBeNull();
    expect(state.search_query).toBe("Jarvis");
    expect(state.filtered_contacts.map((c) => c.id)).toEqual(["j1", "j2"]);

    await go_back();

    expect(window.location.pathname).toBe("/inbox");
  });

  it("in-app back closes the contact without leaving an extra history step", async () => {
    await open_jarvis_from_search();

    await act(async () => {
      const popped = wait_for_popstate();

      state.close_contact_detail();
      await popped;
    });

    expect(window.location.pathname).toBe("/contacts");
    expect(state.selected_contact).toBeNull();
    expect(state.search_query).toBe("Jarvis");

    await go_back();

    expect(window.location.pathname).toBe("/inbox");
  });

  it("deleting the open contact returns to search results without it", async () => {
    vi.spyOn(contacts_api, "update_contact_encrypted").mockResolvedValue({
      data: {},
    } as never);
    await open_jarvis_from_search();

    await act(async () => {
      state.request_delete_contact(contacts[0]);
    });
    await act(async () => {
      const popped = wait_for_popstate();

      await state.confirm_delete();
      await popped;
    });

    expect(window.location.pathname).toBe("/contacts");
    expect(state.selected_contact).toBeNull();
    expect(state.search_query).toBe("Jarvis");
    expect(state.filtered_contacts.map((c) => c.id)).toEqual(["j2"]);
  });

  it("unstarring a contact opened from favorites returns to favorites without it", async () => {
    vi.spyOn(contacts_api, "update_contact_encrypted").mockResolvedValue({
      data: {},
    } as never);
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      state.set_filter("favorites");
    });
    expect(state.filtered_contacts.map((c) => c.id)).toEqual(["a1", "b1"]);
    await act(async () => {
      state.handle_contact_press(contacts[2]);
    });
    await act(async () => {
      await state.handle_toggle_favorite(contacts[2]);
    });
    expect(state.selected_contact?.is_favorite).toBe(false);

    await go_back();

    expect(window.location.pathname).toBe("/contacts");
    expect(state.selected_contact).toBeNull();
    expect(state.filter).toBe("favorites");
    expect(state.favorites_count).toBe(1);
    expect(state.filtered_contacts.map((c) => c.id)).toEqual(["b1"]);
  });
});
