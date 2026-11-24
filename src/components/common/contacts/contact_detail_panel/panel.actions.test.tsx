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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { ContactDetailPanel } from "./panel";

import * as contacts_api from "@/services/api/contacts";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: false }),
  use_auth_safe: () => ({ has_keys: false }),
}));

vi.mock("@/components/common/contacts/contact_avatar", () => ({
  ContactAvatar: () => null,
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

const t = ((key: string) => key) as never;
const noop = () => {};

const contact = {
  id: "c1",
  first_name: "Ana",
  last_name: "Exemplo",
  emails: ["ana@example.test"],
  is_favorite: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as DecryptedContact;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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

const render_panel = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ContactDetailPanel
          is_creating_new={false}
          on_compose_email={noop}
          on_copy={noop}
          on_delete_request={noop}
          on_edit={noop}
          on_search_mail={noop}
          on_toggle_favorite={noop}
          selected_contact={contact}
          set_show_history={noop}
          show_history={false}
          t={t}
        />
      </MemoryRouter>,
    );
  });
};

const button_labels = () =>
  Array.from(container.querySelectorAll("button")).map(
    (button) => button.getAttribute("aria-label") || button.textContent,
  );

describe("contact detail actions", () => {
  it("keeps send and edit visible and moves the rest into a menu", async () => {
    await render_panel();

    const labels = button_labels();

    expect(labels).toContain("common.send_email");
    expect(labels).toContain("common.edit");
    expect(labels).toContain("common.more_actions");
    expect(labels).not.toContain("common.history");
    expect(labels).not.toContain("common.all_mail");
    expect(labels).not.toContain("common.favorite");
    expect(labels).not.toContain("common.share_contact");
    expect(labels).not.toContain("common.delete");
  });

  it("centers a detail row that holds a single value", async () => {
    await render_panel();

    const row = container.querySelector(
      "[data-testid='contact_view_row_email']",
    ) as HTMLElement | null;

    expect(row).toBeTruthy();
    expect(row!.className).toContain("items-center");
    expect(row!.className).not.toContain("items-start");
  });
});
