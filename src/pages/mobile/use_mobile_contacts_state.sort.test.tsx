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

function make_contact(
  id: string,
  first_name: string,
  last_name = "",
): DecryptedContact {
  return {
    id,
    first_name,
    last_name,
    emails: [`${id}@example.com`],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const contacts: DecryptedContact[] = [
  make_contact("c1", "Otto"),
  make_contact("c2", "Oscar"),
  make_contact("c3", "Olivia"),
  make_contact("c4", "Ben", "Young"),
  make_contact("c5", "Ben", "Adams"),
  make_contact("c6", "Bea"),
  make_contact("zoe", ""),
  make_contact("adam", ""),
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

describe("mobile contacts sorting", () => {
  let container: HTMLDivElement;
  let root: Root;
  let grouped: [string, DecryptedContact[]][] = [];

  function Probe() {
    grouped = use_mobile_contacts_state(() => {}).grouped;

    return null;
  }

  beforeEach(() => {
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

  it("sorts the contacts in each letter by name", async () => {
    await act(async () => {
      root.render(<Probe />);
    });

    const by_letter = Object.fromEntries(
      grouped.map(([letter, list]) => [letter, list.map((c) => c.id)]),
    );

    expect(by_letter["O"]).toEqual(["c3", "c2", "c1"]);
    expect(by_letter["B"]).toEqual(["c6", "c5", "c4"]);
  });

  it("sorts contacts without a name by their email", async () => {
    await act(async () => {
      root.render(<Probe />);
    });

    const by_letter = Object.fromEntries(
      grouped.map(([letter, list]) => [letter, list.map((c) => c.id)]),
    );

    expect(by_letter["#"]).toEqual(["adam", "zoe"]);
  });
});
