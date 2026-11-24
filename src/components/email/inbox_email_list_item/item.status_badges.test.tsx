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
  use_alias_row_info: () => ({ delivery: null, custom_domain_label: null }),
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

function make_email(overrides: Partial<InboxEmail>): InboxEmail {
  return {
    id: "email-1",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: "Weekly digest",
    preview: "preview",
    timestamp: "10:00",
    is_read: false,
    is_selected: false,
    ...overrides,
  } as unknown as InboxEmail;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(current_view: string, target: InboxEmail): void {
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

function has_badge(label: string): boolean {
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

describe("InboxEmailListItem status badges", () => {
  const trashed = make_email({ is_trashed: true });
  const spam = make_email({ is_spam: true });

  it("hides the trashed badge inside trash", () => {
    render("trash", trashed);

    expect(has_badge("mail.trashed_label")).toBe(false);
  });

  it("shows the trashed badge in search results and all mail", () => {
    render("search", trashed);
    expect(has_badge("mail.trashed_label")).toBe(true);

    render("all", trashed);
    expect(has_badge("mail.trashed_label")).toBe(true);
  });

  it("hides the spam badge inside spam", () => {
    render("spam", spam);

    expect(has_badge("mail.spam_label")).toBe(false);
  });

  it("shows the spam badge in search results and all mail", () => {
    render("search", spam);
    expect(has_badge("mail.spam_label")).toBe(true);

    render("all", spam);
    expect(has_badge("mail.spam_label")).toBe(true);
  });

  it("keeps the badge of the other folder", () => {
    const both = make_email({ is_trashed: true, is_spam: true });

    render("trash", both);
    expect(has_badge("mail.trashed_label")).toBe(false);
    expect(has_badge("mail.spam_label")).toBe(true);

    render("spam", both);
    expect(has_badge("mail.spam_label")).toBe(false);
    expect(has_badge("mail.trashed_label")).toBe(true);
  });

  it("hides the archived badge only inside archive", () => {
    const archived = make_email({ is_archived: true });

    render("archive", archived);
    expect(has_badge("mail.archived_label")).toBe(false);

    render("all", archived);
    expect(has_badge("mail.archived_label")).toBe(true);
  });

  it("hides the sent badge only inside sent", () => {
    const sent = make_email({ item_type: "sent" });

    render("sent", sent);
    expect(has_badge("mail.sent_label")).toBe(false);

    render("search", sent);
    expect(has_badge("mail.sent_label")).toBe(true);
  });
});
