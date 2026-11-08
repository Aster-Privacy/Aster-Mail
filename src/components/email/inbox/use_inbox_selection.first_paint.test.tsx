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
let finish_load: (ids: string[]) => void;
let start_load: () => void;
let replace_rows: (ids: string[]) => void;

function make_email(id: string): InboxEmail {
  return { id, is_selected: false } as unknown as InboxEmail;
}

function ids_from(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function carry_selection(prev: InboxEmail[], ids: string[]): InboxEmail[] {
  const selected = new Set(prev.filter((e) => e.is_selected).map((e) => e.id));

  return ids.map((id) => ({
    ...make_email(id),
    is_selected: selected.has(id),
  }));
}

function Harness({
  initial,
  loading,
}: {
  initial: string[];
  loading: boolean;
}) {
  const [emails, set_emails] = useState<InboxEmail[]>(() =>
    initial.map(make_email),
  );
  const [is_loading, set_is_loading] = useState(loading);

  const update_email = (id: string, updates: Partial<InboxEmail>) => {
    set_emails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    );
  };

  finish_load = (ids) => {
    set_emails((prev) => carry_selection(prev, ids));
    set_is_loading(false);
  };
  start_load = () => set_is_loading(true);
  replace_rows = (ids) => set_emails((prev) => carry_selection(prev, ids));

  hook = use_inbox_selection({
    current_view: "inbox",
    active_category: "",
    is_drafts_view: false,
    is_scheduled_view: false,
    is_loading,
    emails,
    pinned_emails: [],
    primary_emails: emails,
    update_email,
    update_draft: () => {},
    update_scheduled: () => {},
  });

  return null;
}

let container: HTMLDivElement;
let root: Root;

async function render(initial: string[], loading: boolean) {
  await act(async () => {
    root.render(createElement(Harness, { initial, loading }));
  });
}

describe("use_inbox_selection while the page is still loading", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("selects every row of the page when select all is pressed during the first paint", async () => {
    const page = ids_from("m", 50);

    await render(page.slice(0, 16), true);

    await act(async () => {
      hook.handle_toggle_select_all();
    });

    expect(hook.page_selected_count).toBe(16);

    await act(async () => {
      finish_load(page);
    });

    expect(hook.page_selected_count).toBe(50);
    expect(hook.all_selected).toBe(true);
    expect(hook.some_selected).toBe(false);
  });

  it("does not select rows that arrive after the page finished loading", async () => {
    const page = ids_from("m", 50);

    await render(page, false);

    await act(async () => {
      hook.handle_toggle_select_all();
    });

    expect(hook.page_selected_count).toBe(50);

    await act(async () => {
      replace_rows(["fresh", ...page]);
    });

    expect(hook.page_selected_count).toBe(50);
    expect(hook.all_selected).toBe(false);
  });

  it("does not carry a select all over to the next page", async () => {
    await render(ids_from("p0_", 50), false);

    await act(async () => {
      start_load();
    });

    await act(async () => {
      hook.handle_toggle_select_all();
    });

    expect(hook.page_selected_count).toBe(50);

    await act(async () => {
      finish_load(ids_from("p1_", 50));
    });

    expect(hook.page_selected_count).toBe(0);
  });

  it("respects a row the user deselects before the page finishes loading", async () => {
    const page = ids_from("m", 50);

    await render(page.slice(0, 16), true);

    await act(async () => {
      hook.handle_toggle_select_all();
    });

    await act(async () => {
      hook.handle_toggle_select("m3");
    });

    expect(hook.page_selected_count).toBe(15);

    await act(async () => {
      finish_load(page);
    });

    expect(hook.page_selected_count).toBe(15);
  });
});
