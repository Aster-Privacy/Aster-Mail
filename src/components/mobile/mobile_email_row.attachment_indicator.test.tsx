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
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: false } }),
}));

vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({ format_email_list: () => "10:00" }),
}));

vi.mock("@/hooks/use_alias_delivery", () => ({
  normalize_alias_candidates: () => "",
  use_alias_delivery: () => null,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@/native/haptic_feedback", () => ({
  haptic_impact: () => {},
  haptic_long_press: () => {},
}));

vi.mock("@/components/mobile/swipe_actions", () => ({
  SwipeActions: ({ children }: { children?: unknown }) => children as never,
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Tooltip: ({ children }: { children?: unknown }) => children as never,
}));

const { MobileEmailRow } = await import("@/components/mobile/mobile_email_row");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(has_attachment: boolean): HTMLElement {
  act(() => {
    root!.render(
      <MobileEmailRow
        current_view="inbox"
        email={
          {
            id: "a",
            item_type: "received",
            sender_name: "Sender",
            sender_email: "sender@example.com",
            subject: "Quarterly report",
            preview: "preview",
            timestamp: "10:00",
            is_read: false,
            is_starred: false,
            has_attachment,
            folders: [],
            tags: [],
          } as unknown as InboxEmail
        }
        on_long_press={() => {}}
        on_press={() => {}}
        selection_mode={false}
      />,
    );
  });

  return container!.querySelector('[data-email-id="a"]') as HTMLElement;
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

describe("MobileEmailRow attachment indicator", () => {
  it("puts one labelled paperclip right before the subject", () => {
    const row = render(true);
    const shown = row.querySelectorAll<HTMLElement>(
      '[data-testid="attachment-indicator"]',
    );

    expect(shown).toHaveLength(1);
    expect(shown[0].getAttribute("aria-label")).toBe("mail.has_attachments");
    expect(shown[0].nextElementSibling?.textContent).toBe("Quarterly report");
  });

  it("shows nothing when the message has no attachment", () => {
    expect(
      render(false).querySelector('[data-testid="attachment-indicator"]'),
    ).toBeNull();
  });
});
