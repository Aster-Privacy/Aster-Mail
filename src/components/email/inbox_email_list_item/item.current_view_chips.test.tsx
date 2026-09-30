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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: () => null,
  subscribe_aliases: () => () => {},
}));

vi.mock("@/hooks/use_alias_delivery", () => ({
  normalize_alias_candidates: () => "",
  use_alias_delivery: () => null,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

vi.mock("@/components/email/official_badge", () => ({
  OfficialBadge: () => null,
}));

vi.mock("@/components/ui/badge_chip", () => ({
  BadgeChip: () => null,
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Tooltip: ({ children }: { children?: unknown }) => <>{children as never}</>,
  Checkbox: () => <span />,
}));

const { InboxEmailListItem } =
  await import("@/components/email/inbox_email_list_item/item");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const email = {
  id: "email-1",
  sender_name: "Sender",
  sender_email: "sender@example.com",
  subject: "Weekly digest",
  preview: "preview",
  timestamp: "10:00",
  is_read: false,
  is_selected: false,
  folders: [
    { folder_token: "tok_news", name: "Newsletters", color: "#3b82f6" },
    { folder_token: "tok_work", name: "Work", color: "#22c55e" },
  ],
  tags: [
    { id: "tag_receipts", name: "Receipts", color: "#22c55e" },
    { id: "tag_travel", name: "Travel", color: "#f59e0b" },
  ],
} as unknown as InboxEmail;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(current_view: string, target: InboxEmail = email): void {
  act(() => {
    root!.render(
      <InboxEmailListItem
        current_view={current_view}
        density="comfortable"
        email={target}
        on_email_click={() => {}}
        on_toggle_select={() => {}}
        show_email_preview={true}
        show_profile_pictures={true}
      />,
    );
  });
}

function has_chip(label: string): boolean {
  return Array.from(container!.querySelectorAll("span")).some(
    (node) => node.textContent === label,
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
});

describe("InboxEmailListItem chips for the current view", () => {
  it("shows every folder and tag chip in the inbox", () => {
    render("inbox");

    expect(has_chip("Newsletters")).toBe(true);
    expect(has_chip("Work")).toBe(true);
    expect(has_chip("Receipts")).toBe(true);
    expect(has_chip("Travel")).toBe(true);
  });

  it("shows every folder chip in all mail and starred", () => {
    render("all");
    expect(has_chip("Newsletters")).toBe(true);
    expect(has_chip("Work")).toBe(true);

    render("starred");
    expect(has_chip("Newsletters")).toBe(true);
    expect(has_chip("Work")).toBe(true);
  });

  it("hides only the chip of the folder being viewed", () => {
    render("folder-tok_news");

    expect(has_chip("Newsletters")).toBe(false);
    expect(has_chip("Work")).toBe(true);
    expect(has_chip("Receipts")).toBe(true);
    expect(has_chip("Travel")).toBe(true);
  });

  it("hides only the chip of the tag being viewed", () => {
    render("tag-tag_receipts");

    expect(has_chip("Receipts")).toBe(false);
    expect(has_chip("Travel")).toBe(true);
    expect(has_chip("Newsletters")).toBe(true);
    expect(has_chip("Work")).toBe(true);
  });

  it("does not hide a folder chip when a tag shares its token", () => {
    render("tag-tok_news");

    expect(has_chip("Newsletters")).toBe(true);
  });

  it("does not hide chips of another folder", () => {
    render("folder-tok_other");

    expect(has_chip("Newsletters")).toBe(true);
    expect(has_chip("Work")).toBe(true);
  });

  it("counts overflow without the folder being viewed", () => {
    const many = {
      ...email,
      tags: [],
      folders: ["a", "b", "c", "d", "e"].map((id) => ({
        folder_token: `tok_${id}`,
        name: `Folder ${id}`,
      })),
    } as unknown as InboxEmail;

    render("inbox", many);
    expect(has_chip("+2")).toBe(true);

    render("folder-tok_a", many);
    expect(has_chip("Folder a")).toBe(false);
    expect(has_chip("Folder e")).toBe(false);
    expect(has_chip("+1")).toBe(true);
  });
});
