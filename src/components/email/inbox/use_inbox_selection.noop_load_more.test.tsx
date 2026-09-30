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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/hooks/use_email_selection", () => ({
  use_email_selection: () => ({
    toggle_select: vi.fn(),
    get_selected_ids: (emails: InboxEmail[]) =>
      emails.filter((e) => e.is_selected).map((e) => e.id),
    get_selection_state: (emails: InboxEmail[]) => ({
      all_selected: emails.length > 0 && emails.every((e) => e.is_selected),
      some_selected: emails.some((e) => e.is_selected),
      selected_count: emails.filter((e) => e.is_selected).length,
    }),
  }),
}));

vi.mock("@/lib/use_shift_range_select", () => ({
  use_shift_key_ref: () => ({ current: false }),
}));

import { use_inbox_selection } from "@/components/email/inbox/use_inbox_selection";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_inbox_selection>;

let hook: HookResult;

function make_email(id: string, is_selected: boolean): InboxEmail {
  return { id, is_selected } as unknown as InboxEmail;
}

function CategoryHarness() {
  const [emails, set_emails] = useState<InboxEmail[]>([
    make_email("a", false),
    make_email("b", false),
  ]);
  const [page, set_page] = useState(0);

  const update_email = (id: string, updates: Partial<InboxEmail>) => {
    set_emails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    );
  };

  const go_to_last_page = () => {
    set_page(1);
    set_emails([make_email("c", false), make_email("d", false)]);
  };

  hook = use_inbox_selection({
    current_view: "inbox",
    active_category: "primary",
    is_drafts_view: false,
    is_scheduled_view: false,
    emails,
    pinned_emails: [],
    primary_emails: emails,
    update_email,
    update_draft: () => {},
    update_scheduled: () => {},
  });

  return createElement(
    "button",
    { onClick: go_to_last_page, "data-testid": "next-page" },
    page,
  );
}

let container: HTMLDivElement;
let root: Root;

describe("use_inbox_selection with a non-accumulating (categorized inbox) view", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("selects only the current page and never auto-selects a later page the user merely navigates to", async () => {
    await act(async () => {
      root.render(createElement(CategoryHarness));
    });

    await act(async () => {
      hook.handle_toggle_select_all();
    });

    expect(hook.selected_count).toBe(2);

    const button = container.querySelector(
      '[data-testid="next-page"]',
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(hook.selected_count).toBe(0);
  });
});
