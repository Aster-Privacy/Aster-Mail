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
import { createElement, act } from "react";
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
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_inbox_selection>;

let hook: HookResult;

interface ProbeProps {
  view: string;
  category: string;
  emails: InboxEmail[];
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
}

function Probe({ view, category, emails, update_email }: ProbeProps) {
  hook = use_inbox_selection({
    current_view: view,
    active_category: category,
    is_drafts_view: false,
    is_scheduled_view: false,
    emails,
    pinned_emails: [],
    primary_emails: emails,
    update_email,
    update_draft: () => {},
    update_scheduled: () => {},
  });

  return null;
}

function make_email(id: string, is_selected: boolean): InboxEmail {
  return { id, is_selected } as unknown as InboxEmail;
}

let container: HTMLDivElement;
let root: Root;

function render(props: ProbeProps) {
  act(() => {
    root.render(createElement(Probe, props));
  });
}

describe("use_inbox_selection scope reset", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("resets select_all_mode when the active category changes", () => {
    const update_email = vi.fn();
    const emails = [make_email("a", false)];

    render({ view: "inbox", category: "primary", emails, update_email });
    act(() => hook.activate_select_all_mode());
    expect(hook.select_all_mode).toBe(true);

    render({ view: "inbox", category: "social", emails, update_email });
    expect(hook.select_all_mode).toBe(false);
  });

  it("resets select_all_mode when the view changes", () => {
    const update_email = vi.fn();
    const emails = [make_email("a", false)];

    render({ view: "inbox", category: "primary", emails, update_email });
    act(() => hook.activate_select_all_mode());
    expect(hook.select_all_mode).toBe(true);

    render({ view: "archive", category: "primary", emails, update_email });
    expect(hook.select_all_mode).toBe(false);
  });

  it("clears the selection when the scope changes", () => {
    const update_email = vi.fn();
    const emails = [make_email("a", true), make_email("b", false)];

    render({ view: "inbox", category: "primary", emails, update_email });
    render({ view: "inbox", category: "updates", emails, update_email });

    expect(update_email).toHaveBeenCalledWith("a", { is_selected: false });
    expect(update_email).not.toHaveBeenCalledWith("b", { is_selected: false });
  });

  it("keeps select_all_mode across re-renders with the same scope", () => {
    const update_email = vi.fn();
    const emails = [make_email("a", true)];

    render({ view: "inbox", category: "primary", emails, update_email });
    act(() => hook.activate_select_all_mode());

    render({ view: "inbox", category: "primary", emails, update_email });
    expect(hook.select_all_mode).toBe(true);
    expect(update_email).not.toHaveBeenCalled();
  });
});
