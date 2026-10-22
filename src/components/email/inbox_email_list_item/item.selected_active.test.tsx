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

const email = {
  id: "email-1",
  sender_name: "Sender",
  sender_email: "sender@example.com",
  subject: "Order shipped",
  preview: "preview",
  timestamp: "10:00",
  is_read: true,
  is_selected: false,
  folders: [],
  tags: [],
} as unknown as InboxEmail;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_row(is_selected: boolean, is_active: boolean): HTMLElement {
  act(() => {
    root!.render(
      <InboxEmailListItem
        current_view="inbox"
        density="comfortable"
        email={{ ...email, is_selected } as InboxEmail}
        is_active={is_active}
        on_email_click={() => {}}
        on_toggle_select={() => {}}
        show_email_preview={true}
        show_profile_pictures={true}
      />,
    );
  });

  return container!.firstElementChild as HTMLElement;
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

describe("InboxEmailListItem selection highlight", () => {
  it("highlights the open message as selected when it is selected", () => {
    const row = render_row(true, true);

    expect(row.classList.contains("mail_row_selected")).toBe(true);
    expect(row.classList.contains("bg-surf-hover")).toBe(false);
  });

  it("keeps the open highlight when the open message is not selected", () => {
    const row = render_row(false, true);

    expect(row.classList.contains("bg-surf-hover")).toBe(true);
    expect(row.classList.contains("mail_row_selected")).toBe(false);
  });

  it("highlights a selected message that is not open", () => {
    const row = render_row(true, false);

    expect(row.classList.contains("mail_row_selected")).toBe(true);
  });
});
