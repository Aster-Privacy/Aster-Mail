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

const review_subject =
  "Re: Code review: inbox list layout after v3.2.0 - row spacing, avatar alignment, compact density and other notes";
const review_preview =
  "Hello again, This follows up yesterday's review of the layout branch at 3aa24666d. I've now gone through the remaining items from that thread in detail. 1. The login code path in layout_row.tsx line 412 still renders the old avatar size; the change added in 9c1e2f7 runs too late. Reproduced on 612716 with build v3.2.0.";

const base_email = {
  id: "email-1",
  sender_name: "Sender",
  sender_email: "reviewer@example.org",
  subject: review_subject,
  preview: review_preview,
  timestamp: "10:00",
  is_read: false,
  is_selected: false,
  has_attachment: false,
  folders: [],
  tags: [],
} as unknown as InboxEmail;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_row(overrides: Partial<InboxEmail> = {}): HTMLElement {
  act(() => {
    root!.render(
      <InboxEmailListItem
        current_view="inbox"
        density="comfortable"
        email={{ ...base_email, ...overrides } as InboxEmail}
        is_active={false}
        on_archive={() => {}}
        on_email_click={() => {}}
        on_toggle_select={() => {}}
        show_email_preview={true}
        show_profile_pictures={true}
      />,
    );
  });

  return container!.firstElementChild as HTMLElement;
}

function copy_buttons(row: HTMLElement): HTMLElement[] {
  return [
    ...row.querySelectorAll<HTMLElement>('[data-testid="row-copy-code"]'),
  ];
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

describe("InboxEmailListItem verification code chip", () => {
  it("shows no copy code chip on a long technical reply", () => {
    const row = render_row();

    expect(copy_buttons(row)).toHaveLength(0);
    expect(row.textContent).not.toContain("612716");
  });

  it("shows the code chip on a real sign-in code email", () => {
    const row = render_row({
      sender_email: "no-reply@example.com",
      subject: "Your sign-in code",
      preview: "Your verification code is 482913. It expires in 10 minutes.",
    });
    const buttons = copy_buttons(row);

    expect(buttons.length).toBeGreaterThan(0);
    expect(row.textContent).toContain("482913");
  });
});
