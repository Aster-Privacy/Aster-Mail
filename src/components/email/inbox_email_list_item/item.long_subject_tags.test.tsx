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

vi.mock("@aster/ui", () => ({
  Tooltip: ({ children }: { children?: unknown }) => <>{children as never}</>,
  Checkbox: () => <span />,
}));

const { InboxEmailListItem } = await import(
  "@/components/email/inbox_email_list_item/item"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const long_subject = "Your quarterly account statement is ready to review ".repeat(
  10,
);

const spam_email = {
  id: "spam-1",
  sender_name: "Sender",
  sender_email: "sender@example.com",
  subject: long_subject,
  preview: "preview",
  timestamp: "10:00",
  is_read: false,
  is_selected: false,
  is_spam: true,
  folders: [],
  tags: [{ id: "tag-1", name: "Receipts", color: "#22c55e" }],
} as unknown as InboxEmail;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(email: InboxEmail): void {
  act(() => {
    root!.render(
      <InboxEmailListItem
        current_view="spam"
        density="comfortable"
        email={email}
        show_email_preview={true}
        show_profile_pictures={true}
        on_email_click={() => {}}
        on_toggle_select={() => {}}
      />,
    );
  });
}

function element_with_text(text: string): HTMLElement {
  const match = Array.from(container!.querySelectorAll("span")).find(
    (node) => node.textContent === text,
  );

  expect(match).toBeDefined();

  return match as HTMLElement;
}

function tag_root(label: string): HTMLElement {
  let node: HTMLElement | null = element_with_text(label);

  while (node && !node.className.includes("flex-shrink-0")) {
    node = node.parentElement;
  }

  expect(node).not.toBeNull();

  return node as HTMLElement;
}

function subject_container(): HTMLElement {
  const subject = element_with_text(long_subject.trim());

  return subject.parentElement as HTMLElement;
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

describe("InboxEmailListItem tags with a long subject", () => {
  it("keeps the spam tag out of the truncating subject", () => {
    render({ ...spam_email, subject: long_subject.trim() } as InboxEmail);

    const spam_tag = tag_root("mail.spam_label");
    const subject = subject_container();

    expect(spam_tag.className.split(/\s+/)).toContain("flex-shrink-0");
    expect(subject.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["min-w-0", "flex-1", "truncate"]),
    );
    expect(subject.contains(spam_tag)).toBe(false);
    expect(spam_tag.parentElement).toBe(subject.parentElement);
    expect(
      spam_tag.compareDocumentPosition(subject) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("lets the row shrink so the subject truncates instead of the tags", () => {
    render({ ...spam_email, subject: long_subject.trim() } as InboxEmail);

    const row = subject_container().parentElement as HTMLElement;

    expect(row.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["min-w-0", "flex-1", "overflow-hidden"]),
    );
  });

  it("keeps label tags non-shrinking beside a long subject", () => {
    render({ ...spam_email, subject: long_subject.trim() } as InboxEmail);

    const label_tag = tag_root("Receipts");
    const group = label_tag.parentElement as HTMLElement;

    expect(label_tag.className.split(/\s+/)).toContain("flex-shrink-0");
    expect(group.className.split(/\s+/)).toContain("flex-shrink-0");
    expect(subject_container().contains(label_tag)).toBe(false);
  });

  it("renders the spam tag for short and long subjects alike", () => {
    render({ ...spam_email, subject: "Hi" } as InboxEmail);
    expect(tag_root("mail.spam_label")).toBeTruthy();

    render({ ...spam_email, subject: long_subject.trim() } as InboxEmail);
    expect(tag_root("mail.spam_label")).toBeTruthy();
  });
});
