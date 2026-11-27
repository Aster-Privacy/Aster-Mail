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

const mock_state = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: mock_state.preferences }),
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

const { InboxEmailListItem, MailRowSkeleton, MailRowSkeletonList } =
  await import("@/components/email/inbox_email_list_item");
const { MAIL_ROW_LAYOUT } =
  await import("@/components/email/inbox_email_list_item/helpers");
const { SEARCH_ROW_DIVIDER_CLASS } = await import("./helpers");
const { cn } = await import("@/lib/utils");
const { list_row_intrinsic_height, resolve_list_density } =
  await import("@/lib/list_density");

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

interface RowParts {
  row: Element;
  select_slot: Element;
  content: Element;
  sender: Element;
  subject: Element;
  meta: Element;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function parts_of(row: Element): RowParts {
  const select_slot = row.firstElementChild!;
  const content = select_slot.nextElementSibling!;
  const sender = content.firstElementChild!;

  return {
    row,
    select_slot,
    content,
    sender,
    subject: sender.nextElementSibling!,
    meta: row.querySelector(":scope > .ms-auto")!,
  };
}

function render_pair(): { real: RowParts; skeleton: RowParts } {
  const show_profile_pictures =
    mock_state.preferences.show_profile_pictures !== false;

  act(() => {
    root!.render(
      <>
        <InboxEmailListItem
          className={SEARCH_ROW_DIVIDER_CLASS}
          current_view="search"
          density={resolve_list_density(
            mock_state.preferences.mail_list_density as string | undefined,
          )}
          email={email}
          on_email_click={() => {}}
          on_toggle_select={() => {}}
          show_email_preview={true}
          show_profile_pictures={show_profile_pictures}
        />
        <MailRowSkeleton className={SEARCH_ROW_DIVIDER_CLASS} />
      </>,
    );
  });

  return {
    real: parts_of(container!.children[0]),
    skeleton: parts_of(container!.children[1]),
  };
}

function expect_classes(element: Element, classes: string) {
  for (const name of classes.split(" ")) {
    expect(element.classList.contains(name), name).toBe(true);
  }
}

function size_classes(element: Element): string[] {
  return Array.from(element.classList).filter((name) =>
    /^(w|h|p[xy]?|gap)-/.test(name.replace(/^sm:/, "")),
  );
}

beforeEach(() => {
  mock_state.preferences = {};
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

describe("search results skeleton", () => {
  it.each([
    ["compact", {}],
    ["comfortable", { mail_list_density: "comfortable" }],
    ["compact without avatars", { show_profile_pictures: false }],
    [
      "comfortable without avatars",
      { mail_list_density: "comfortable", show_profile_pictures: false },
    ],
  ])("uses the inbox row layout and sizes (%s)", (_label, preferences) => {
    mock_state.preferences = preferences;
    const { real, skeleton } = render_pair();

    expect(skeleton.row.getAttribute("data-testid")).toBe("mail-row-skeleton");

    for (const key of Object.keys(MAIL_ROW_LAYOUT) as Array<
      keyof typeof MAIL_ROW_LAYOUT
    >) {
      if (key === "mobile_date") continue;
      const layout =
        key === "row"
          ? cn(MAIL_ROW_LAYOUT.row, SEARCH_ROW_DIVIDER_CLASS)
          : MAIL_ROW_LAYOUT[key];

      expect_classes(real[key], layout);
      expect_classes(skeleton[key], layout);
      expect(size_classes(skeleton[key])).toEqual(size_classes(real[key]));
    }
  });

  it("shows a round avatar placeholder only when avatars are on", () => {
    const with_avatar = render_pair().skeleton.select_slot;

    expect_classes(with_avatar, "w-7 h-7");
    expect(
      with_avatar.firstElementChild!.classList.contains("rounded-full"),
    ).toBe(true);

    mock_state.preferences = { show_profile_pictures: false };
    const without_avatar = render_pair().skeleton.select_slot;

    expect_classes(without_avatar, "w-[18px] h-[18px]");
    expect(
      without_avatar.firstElementChild!.classList.contains("rounded-full"),
    ).toBe(false);
  });

  it("keeps every row to a single line", () => {
    const { skeleton } = render_pair();

    expect(skeleton.row.querySelectorAll(".flex-col")).toHaveLength(0);
    expect(skeleton.content.classList.contains("items-center")).toBe(true);
  });
  it("fills the subject column with a subject and preview bar", () => {
    const { skeleton } = render_pair();
    const preview = skeleton.subject.querySelector(
      "[data-testid='mail-row-skeleton-preview']",
    );

    expect(skeleton.subject.children).toHaveLength(2);
    expect(preview?.classList.contains("flex-1")).toBe(true);

    mock_state.preferences = { show_email_preview: false };
    const without_preview = render_pair().skeleton.subject;

    expect(without_preview.children).toHaveLength(1);
  });

  it.each([
    ["compact", {}],
    ["comfortable", { mail_list_density: "comfortable" }],
  ])("renders enough rows to fill the viewport (%s)", (_label, preferences) => {
    mock_state.preferences = preferences;
    const row_height = list_row_intrinsic_height(
      resolve_list_density(
        mock_state.preferences.mail_list_density as string | undefined,
      ),
      false,
      false,
    );

    act(() => {
      root!.render(<MailRowSkeletonList />);
    });

    expect(
      container!.querySelectorAll("[data-testid='mail-row-skeleton']"),
    ).toHaveLength(Math.ceil(window.innerHeight / row_height));
  });
});
