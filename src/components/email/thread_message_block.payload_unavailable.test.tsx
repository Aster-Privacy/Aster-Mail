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

const events = vi.hoisted(() => ({
  emit_refresh_requested: vi.fn(),
  emit_mail_soft_refresh: vi.fn(),
}));

vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/mail_events")>()),
  ...events,
}));

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
const { ThreadMessageBlock } = await import("./thread_message_block");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const base_message: DecryptedThreadMessage = {
  id: "msg_1",
  item_type: "received",
  sender_name: "common.unknown_sender",
  sender_email: "",
  subject: "common.message_temporarily_unavailable",
  body: "",
  html_content: undefined,
  timestamp: "2026-11-20T09:00:00.000Z",
  is_read: true,
  is_starred: false,
  is_deleted: false,
  is_external: true,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  settings.preferences = { ...DEFAULT_PREFERENCES };
  events.emit_refresh_requested.mockReset();
  events.emit_mail_soft_refresh.mockReset();
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

function render_block(message: DecryptedThreadMessage): void {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded
        is_single_message
        is_own_message={false}
        message={message}
        on_toggle={() => {}}
      />,
    );
  });
}

function retry_button(): HTMLButtonElement | undefined {
  return Array.from(container!.querySelectorAll("button")).find(
    (node) => node.textContent === "common.unavailable_try_again",
  );
}

describe("ThreadMessageBlock for a message whose body could not be fetched", () => {
  it("shows the temporarily unavailable state with a retry that refetches", () => {
    render_block({ ...base_message, payload_unavailable: true });

    expect(container!.textContent).toContain(
      "common.message_temporarily_unavailable",
    );

    const button = retry_button();

    expect(button).toBeDefined();
    act(() => button!.click());

    expect(events.emit_refresh_requested).toHaveBeenCalledTimes(1);
    expect(events.emit_mail_soft_refresh).toHaveBeenCalledTimes(1);
  });

  it("shows no retry for a message without the flag", () => {
    render_block({ ...base_message, subject: "Hello", body: "Hi" });

    expect(retry_button()).toBeUndefined();
  });
});
