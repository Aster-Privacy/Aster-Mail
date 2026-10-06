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
import type { ComponentType, ReactNode, SVGProps } from "react";

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

const { DEFAULT_PREFERENCES } = await import("@/services/api/preferences");
const { NotSpamIcon, ReportSpamIcon } =
  await import("@/components/email/spam_action_icons");
const { ThreadMessageBlock } = await import("./thread_message_block");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const message: DecryptedThreadMessage = {
  id: "msg_1",
  item_type: "received",
  sender_name: "Example Weekly",
  sender_email: "news@example.com",
  subject: "Five small habits",
  body: "Weekly digest",
  html_content: "<p>Weekly digest</p>",
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

function icon_markup(Icon: Icon): string | undefined {
  const host = document.createElement("div");
  const icon_root = createRoot(host);

  act(() => icon_root.render(<Icon />));
  const markup = host.querySelector("svg")?.innerHTML;

  act(() => icon_root.unmount());

  return markup;
}

function menu_icon(label: string): string | undefined {
  const item = Array.from(
    container!.querySelectorAll('[role="menuitem"]'),
  ).find((node) => node.textContent === label);

  return item?.querySelector("svg")?.innerHTML;
}

function render_block(
  handlers: Partial<{
    on_report_phishing: (msg: DecryptedThreadMessage) => void;
    on_not_spam: (msg: DecryptedThreadMessage) => void;
  }>,
): void {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded
        is_single_message
        is_own_message={false}
        message={message}
        on_toggle={() => {}}
        {...handlers}
      />,
    );
  });
}

describe("ThreadMessageBlock message menu spam icons", () => {
  it("uses the shared report spam icon for the message's report spam entry", () => {
    const on_report_phishing = vi.fn();

    render_block({ on_report_phishing });

    expect(menu_icon("common.report_phishing")).toBeDefined();
    expect(menu_icon("common.report_phishing")).toBe(
      icon_markup(ReportSpamIcon),
    );
  });

  it("uses the shared not spam icon for the message's not spam entry", () => {
    render_block({ on_not_spam: vi.fn() });

    expect(menu_icon("mail.not_spam")).toBeDefined();
    expect(menu_icon("mail.not_spam")).toBe(icon_markup(NotSpamIcon));
  });
});
