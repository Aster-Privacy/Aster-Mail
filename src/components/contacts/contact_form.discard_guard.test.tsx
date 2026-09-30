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

import { ContactForm } from "./contact_form";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: true } }),
}));

vi.mock("@/components/common/contacts/contact_avatar", () => ({
  ContactAvatar: () => null,
}));

const contact: DecryptedContact = {
  id: "c1",
  first_name: "Test",
  last_name: "Person",
  emails: ["person@example.com"],
  is_favorite: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("contact form discard guard", () => {
  let container: HTMLDivElement;
  let root: Root;
  let closed = 0;

  const render_form = async () => {
    await act(async () => {
      root.render(
        <ContactForm
          is_open
          contact={contact}
          is_loading={false}
          on_close={() => {
            closed += 1;
          }}
          on_submit={async () => {}}
        />,
      );
    });
  };

  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  beforeEach(() => {
    closed = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("closes straight away when nothing was edited", async () => {
    await render_form();
    await click(container.querySelector('[aria-label="common.close"]')!);

    expect(closed).toBe(1);
  });

  it("asks before discarding unsaved edits", async () => {
    await render_form();

    const input = container.querySelector(
      'input:not([type="file"])',
    ) as HTMLInputElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;

      setter?.call(input, "Edited");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await click(container.querySelector('[aria-label="common.close"]')!);

    expect(closed).toBe(0);
    expect(document.body.textContent).toContain("common.unsaved_changes_title");
  });
});
