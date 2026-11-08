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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@aster/ui", async (import_original) => {
  const actual = await import_original<object>();

  return {
    ...actual,
    MobileDrawerNavIndicator: () => null,
    MobileDrawerBackButton: () => null,
    MobileDrawerSectionPlaceholder: () => null,
    MobileDrawerTagIcon: () => null,
    MobileDrawerSectionHeader: ({
      label,
      is_first,
    }: {
      label: string;
      is_first?: boolean;
    }) => (
      <h3 data-first={is_first ? "true" : "false"} data-section={label}>
        {label}
      </h3>
    ),
    MobileSidebarNavButton: ({ label }: { label: string }) => (
      <button data-item={label} type="button">
        {label}
      </button>
    ),
  };
});

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: hoisted.preferences }),
}));

import { DrawerNavContent } from "@/components/mobile/mobile_drawer_nav";

const stats = {
  inbox: 0,
  scheduled: 0,
  snoozed: 0,
  total_items: 0,
  archived: 0,
  spam: 0,
  contacts: 0,
  unread: 0,
  drafts: 0,
  trash: 0,
};

describe("mobile drawer sidebar layout", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_nav = (preferences: Record<string, unknown>) => {
    hoisted.preferences = preferences;
    act(() => {
      root.render(
        <DrawerNavContent
          active_path="/"
          aliases={[]}
          aliases_loading={false}
          folder_unread_counts={{}}
          folders={[]}
          folders_loading={false}
          handle_nav={() => {}}
          indicator_style={{ y: 0, height: 0, opacity: 0 }}
          nav_container_ref={null}
          stats={stats}
          tag_counts={{}}
          tags={[]}
          tags_loading={false}
          on_open_create_alias={() => {}}
          on_open_create_folder={() => {}}
          on_open_create_label={() => {}}
          on_open_edit_folder={() => {}}
          on_open_edit_tag={() => {}}
          on_password_modal={() => {}}
          on_toggle_lock={() => {}}
        />,
      );
    });
  };

  const section_labels = () =>
    Array.from(container.querySelectorAll("h3")).map((node) =>
      node.getAttribute("data-section"),
    );

  const item_labels = () =>
    Array.from(container.querySelectorAll("button[data-item]")).map((node) =>
      node.getAttribute("data-item"),
    );

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows every section in the default order", () => {
    render_nav({});

    expect(section_labels()).toEqual([
      "common.mail",
      "common.more",
      "common.folders",
      "common.labels",
      "common.aliases",
    ]);
    expect(item_labels()).toContain("mail.spam");
    expect(item_labels()).toContain("common.contacts");
    expect(container.querySelector("h3")?.getAttribute("data-first")).toBe(
      "true",
    );
  });

  it("follows the saved order and hides hidden items", () => {
    render_nav({
      sidebar_section_order: ["labels", "future_section", "mail", "aliases"],
      sidebar_hidden_items: ["aliases", "spam", "contacts", "future_item"],
    });

    expect(section_labels()).toEqual([
      "common.labels",
      "common.mail",
      "common.more",
      "common.folders",
    ]);
    expect(
      Array.from(container.querySelectorAll("h3")).map((node) =>
        node.getAttribute("data-first"),
      ),
    ).toEqual(["true", "false", "false", "false"]);
    expect(item_labels()).not.toContain("mail.spam");
    expect(item_labels()).not.toContain("common.contacts");
    expect(item_labels()).toContain("mail.inbox");
    expect(item_labels()).toContain("mail.trash");
  });

  it("keeps inbox and drops the More header when every extra item is hidden", () => {
    render_nav({
      sidebar_hidden_items: [
        "inbox",
        "sent",
        "scheduled",
        "snoozed",
        "drafts",
        "starred",
        "all",
        "archive",
        "spam",
        "trash",
        "contacts",
        "subscriptions",
      ],
    });

    expect(item_labels()).toEqual(["mail.inbox"]);
    expect(section_labels()).not.toContain("common.more");
  });

  it("ignores malformed stored values", () => {
    render_nav({
      sidebar_section_order: "labels",
      sidebar_hidden_items: { 0: "spam" },
    });

    expect(section_labels()).toEqual([
      "common.mail",
      "common.more",
      "common.folders",
      "common.labels",
      "common.aliases",
    ]);
    expect(item_labels()).toContain("mail.spam");
  });
});
