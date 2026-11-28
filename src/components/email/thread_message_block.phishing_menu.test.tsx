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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/ui/dropdown_menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Item = ({ children }: { children?: ReactNode }) => (
    <div role="menuitem" tabIndex={-1}>
      {children}
    </div>
  );

  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: Item,
    DropdownMenuSeparator: () => null,
    DropdownMenuSub: Pass,
    DropdownMenuSubTrigger: Pass,
    DropdownMenuSubContent: Pass,
  };
});

vi.mock("@/components/email/thread_message_body", () => ({
  ThreadMessageBody: () => null,
}));

vi.mock("@/components/email/attachment_list", () => ({
  AttachmentList: () => null,
}));

vi.mock("@/components/email/thread_message_actions", () => ({
  ThreadMessageActions: () => null,
}));

vi.mock("@/components/email/banners/translation_banner", () => ({
  TranslationBanner: () => null,
}));

vi.mock("@/components/email/hooks/use_email_translation", () => ({
  use_email_translation: () => ({ on_document_ready: undefined }),
}));

vi.mock("@/lib/phishing_analyzer", () => ({
  analyze_email_content: () => new Promise(() => {}),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@/components/profile/sender_profile_trigger", () => ({
  SenderProfileTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/hooks/use_alias_delivery", () => ({
  normalize_alias_candidates: () => "",
  use_alias_delivery: () => null,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({ format_email_detail: () => "Oct 5, 2026" }),
}));

const settings = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => settings,
}));

const report_state = vi.hoisted(() => ({ reported: false }));

vi.mock("@/components/email/viewer_shared/report_phishing", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/email/viewer_shared/report_phishing")
  >("@/components/email/viewer_shared/report_phishing");

  return {
    ...actual,
    use_phishing_reported: () => report_state.reported,
  };
});

const { DEFAULT_PREFERENCES } = await import("@/services/api/preferences");
const { ThreadMessageBlock } = await import("./thread_message_block");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const received: DecryptedThreadMessage = {
  id: "msg_1",
  item_type: "received",
  sender_name: "Example Billing",
  sender_email: "billing@example.com",
  subject: "Your invoice",
  body: "Invoice",
  html_content: "<p>Invoice</p>",
  timestamp: "2026-10-01T07:12:00.000Z",
  is_read: true,
  is_starred: false,
  is_deleted: false,
  is_external: true,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  settings.preferences = { ...DEFAULT_PREFERENCES };
  report_state.reported = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function menu_labels(): string[] {
  return Array.from(container!.querySelectorAll('[role="menuitem"]')).map(
    (node) => node.textContent ?? "",
  );
}

function render_block(
  options: {
    message?: DecryptedThreadMessage;
    is_own_message?: boolean;
    in_spam?: boolean;
  } = {},
): void {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded
        is_single_message
        is_own_message={options.is_own_message ?? false}
        message={options.message ?? received}
        on_block_sender={() => {}}
        on_not_spam={options.in_spam ? () => {} : undefined}
        on_report_phishing={() => {}}
        on_toggle={() => {}}
      />,
    );
  });
}

describe("ThreadMessageBlock phishing menu", () => {
  it("shows not spam, report phishing, and block sender together in spam", () => {
    render_block({ in_spam: true });

    const labels = menu_labels();

    expect(labels).toContain("mail.not_spam");
    expect(labels).toContain("common.report_phishing");
    expect(labels).toContain("mail.block_sender");
    expect(labels.indexOf("common.report_phishing")).toBe(
      labels.indexOf("mail.not_spam") + 1,
    );
  });

  it("shows report phishing outside spam without not spam", () => {
    render_block();

    const labels = menu_labels();

    expect(labels).toContain("common.report_phishing");
    expect(labels).not.toContain("mail.not_spam");
  });

  it("shows the reported label after a report", () => {
    report_state.reported = true;
    render_block({ in_spam: true });

    expect(menu_labels()).toContain("common.reported_as_phishing");
    expect(menu_labels()).not.toContain("common.report_phishing");
  });

  it("hides report phishing and block sender for an own message", () => {
    render_block({ is_own_message: true, in_spam: true });

    const labels = menu_labels();

    expect(labels).not.toContain("common.report_phishing");
    expect(labels).not.toContain("mail.block_sender");
  });

  it("hides report phishing for sent mail", () => {
    render_block({ message: { ...received, item_type: "sent" } });

    expect(menu_labels()).not.toContain("common.report_phishing");
  });
});
