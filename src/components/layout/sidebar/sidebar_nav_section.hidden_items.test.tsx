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
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

import { SidebarNavSection } from "./sidebar_nav_section";

const STATS = {
  inbox: 4,
  unread: 2,
  drafts: 1,
  scheduled: 0,
  snoozed: 0,
  total_items: 20,
  archived: 3,
  spam: 5,
  trash: 7,
  contacts: 0,
};

const ALL_LABELS = [
  "mail.inbox",
  "mail.sent",
  "mail.scheduled",
  "mail.snoozed",
  "mail.drafts",
  "common.contacts",
  "mail.starred",
  "mail.all_mail",
  "mail.archive",
  "mail.spam",
  "mail.trash",
  "common.subscriptions",
];

const MORE_IDS = [
  "starred",
  "all",
  "archive",
  "spam",
  "trash",
  "subscriptions",
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

interface RenderOptions {
  hidden_items?: unknown;
  section_collapsed?: boolean;
  is_collapsed?: boolean;
  is_first?: boolean;
}

function render_nav(options: RenderOptions = {}) {
  act(() => {
    root!.render(
      createElement(SidebarNavSection, {
        is_collapsed: options.is_collapsed ?? false,
        effective_selected: "inbox",
        stats: STATS,
        section_collapsed: options.section_collapsed ?? false,
        on_toggle_section: () => {},
        handle_nav_click: (cb: () => void) => cb(),
        set_selected_item: () => {},
        navigate: () => {},
        inbox_ref: createRef(),
        sent_ref: createRef(),
        scheduled_ref: createRef(),
        snoozed_ref: createRef(),
        drafts_ref: createRef(),
        starred_ref: createRef(),
        all_mail_ref: createRef(),
        archive_ref: createRef(),
        spam_ref: createRef(),
        trash_ref: createRef(),
        contacts_ref: createRef(),
        subscriptions_ref: createRef(),
        hidden_items: options.hidden_items,
        is_first: options.is_first,
      } as unknown as Parameters<typeof SidebarNavSection>[0]),
    );
  });
}

function visible_labels(): string[] {
  return Array.from(
    container!.querySelectorAll<HTMLButtonElement>("button.sidebar-nav-btn"),
  ).map((button) => {
    const text = `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("data-rail-tip") ?? ""}`;
    const match = ALL_LABELS.find((label) => text.includes(label));

    return match ?? "";
  });
}

function has_more_toggle(): boolean {
  return Array.from(container!.querySelectorAll("button")).some(
    (button) => button.textContent?.trim() === "common.more",
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});

describe("SidebarNavSection hidden items", () => {
  it("shows every item when nothing is hidden", () => {
    render_nav();

    expect(visible_labels()).toEqual(ALL_LABELS);
    expect(has_more_toggle()).toBe(true);
  });

  it("removes hidden items from both groups and keeps the rest in order", () => {
    render_nav({ hidden_items: ["sent", "contacts", "spam", "subscriptions"] });

    expect(visible_labels()).toEqual([
      "mail.inbox",
      "mail.scheduled",
      "mail.snoozed",
      "mail.drafts",
      "mail.starred",
      "mail.all_mail",
      "mail.archive",
      "mail.trash",
    ]);
  });

  it("never hides Inbox even when the list asks for it", () => {
    render_nav({ hidden_items: ["inbox", "mail"] });

    expect(visible_labels()).toContain("mail.inbox");
    expect(visible_labels()).toHaveLength(ALL_LABELS.length);
  });

  it("hides the More toggle when every item under it is hidden", () => {
    render_nav({ hidden_items: MORE_IDS });

    expect(has_more_toggle()).toBe(false);
    expect(visible_labels()).toEqual(ALL_LABELS.slice(0, 6));
  });

  it("keeps the More toggle while one item under it is still shown", () => {
    render_nav({ hidden_items: MORE_IDS.slice(1) });

    expect(has_more_toggle()).toBe(true);
    expect(visible_labels()).toContain("mail.starred");
  });

  it("ignores unknown ids and malformed values", () => {
    render_nav({ hidden_items: ["future_item", 42, "<b>"] });
    expect(visible_labels()).toEqual(ALL_LABELS);

    render_nav({ hidden_items: "trash" });
    expect(visible_labels()).toEqual(ALL_LABELS);

    render_nav({ hidden_items: null });
    expect(visible_labels()).toEqual(ALL_LABELS);
  });

  it("applies hidden items in the collapsed rail too", () => {
    render_nav({ is_collapsed: true, hidden_items: ["trash", "sent"] });

    const labels = visible_labels();

    expect(labels).not.toContain("mail.trash");
    expect(labels).not.toContain("mail.sent");
    expect(labels).toContain("mail.inbox");
  });

  it("adds top spacing only when Mail is not the first section", () => {
    render_nav({ is_first: true });
    expect(container!.querySelector("div.mt-5[aria-hidden]")).toBeNull();

    render_nav({ is_first: false });
    expect(container!.querySelector("div.mt-5[aria-hidden]")).not.toBeNull();
  });
});
