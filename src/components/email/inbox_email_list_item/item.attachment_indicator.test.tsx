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
import type { AttachmentPreviewEntry } from "@/hooks/use_attachment_previews";
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
  subject: "Quarterly report",
  preview: "preview",
  timestamp: "10:00",
  is_read: false,
  is_selected: false,
  has_attachment: true,
  folders: [],
  tags: [],
} as unknown as InboxEmail;

const loaded: AttachmentPreviewEntry = {
  state: "loaded",
  attachments: [
    {
      id: "att-1",
      filename: "report.pdf",
      content_type: "application/pdf",
      size_bytes: 1024,
      type_label: "PDF",
      type_color: "#e24942",
    },
  ],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_row(
  overrides: Partial<InboxEmail> = {},
  attachment_previews?: AttachmentPreviewEntry,
): HTMLElement {
  act(() => {
    root!.render(
      <InboxEmailListItem
        attachment_previews={attachment_previews}
        current_view="inbox"
        density="comfortable"
        email={{ ...email, ...overrides } as InboxEmail}
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

function indicators(row: HTMLElement): HTMLElement[] {
  return [
    ...row.querySelectorAll<HTMLElement>(
      '[data-testid="attachment-indicator"]',
    ),
  ];
}

function subject(row: HTMLElement): HTMLElement {
  return [...row.querySelectorAll<HTMLElement>("span")].find(
    (span) => span.textContent === "Quarterly report",
  )!;
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

describe("InboxEmailListItem attachment indicator", () => {
  it("shows one labelled paperclip right before the subject at every width", () => {
    const row = render_row();
    const shown = indicators(row);

    expect(shown).toHaveLength(1);
    expect(shown[0].getAttribute("role")).toBe("img");
    expect(shown[0].getAttribute("aria-label")).toBe("mail.has_attachments");
    expect(shown[0].className).not.toMatch(/\b(hidden|md:hidden|sm:hidden)\b/);
    expect(
      shown[0].compareDocumentPosition(subject(row)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(shown[0].nextElementSibling?.contains(subject(row))).toBe(true);
  });

  it("no longer puts a paperclip next to the date", () => {
    const row = render_row({ is_starred: true });
    const trailing = row.querySelector(".ms-auto") as HTMLElement;

    expect(trailing.textContent).toContain("10:00");
    expect(trailing.querySelectorAll("svg")).toHaveLength(1);
    expect(indicators(trailing)).toHaveLength(0);
  });

  it("keeps the paperclip while previews load or fail", () => {
    for (const state of ["loading", "error"] as const) {
      const row = render_row({}, { state, attachments: [] });

      expect(indicators(row)).toHaveLength(1);
      expect(indicators(row)[0].classList.contains("md:hidden")).toBe(false);
      expect(
        row.querySelector('[data-testid="attachment-chips-container"]'),
      ).toBeNull();
    }
  });

  it("keeps the paperclip by the subject when the chips show", () => {
    const row = render_row({}, loaded);

    expect(
      row.querySelector('[data-testid="attachment-chips-container"]'),
    ).not.toBeNull();
    expect(indicators(row)).toHaveLength(1);
    expect(indicators(row)[0].className).not.toMatch(
      /\b(hidden|md:hidden|sm:hidden)\b/,
    );
  });

  it("dims with the rest of a read row", () => {
    expect(
      indicators(render_row({ is_read: true }))[0].classList.contains(
        "text-txt-muted",
      ),
    ).toBe(true);
    expect(
      indicators(render_row({ is_read: false }))[0].classList.contains(
        "text-txt-secondary",
      ),
    ).toBe(true);
  });

  it("shows nothing when the message has no attachment", () => {
    expect(indicators(render_row({ has_attachment: false }))).toHaveLength(0);
  });
});
