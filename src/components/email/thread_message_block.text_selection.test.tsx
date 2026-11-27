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

  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: () => null,
    DropdownMenuItem: () => null,
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

const message: DecryptedThreadMessage = {
  id: "msg_1",
  item_type: "received",
  sender_name: "kosei",
  sender_email: "kosei@astermail.org",
  subject: "Hello",
  body: "Hi",
  html_content: "<p>Hi</p>",
  timestamp: "2026-10-01T07:12:00.000Z",
  is_read: true,
  is_starred: false,
  is_deleted: false,
  is_external: false,
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
  window.getSelection()?.removeAllRanges();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render_block(is_expanded: boolean, on_toggle: () => void): void {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded={is_expanded}
        is_last_in_thread={false}
        is_own_message={false}
        is_single_message={false}
        message={message}
        on_toggle={on_toggle}
      />,
    );
  });
}

function find_text(text: string): HTMLElement {
  const match = Array.from(
    container!.querySelectorAll<HTMLElement>("span, bdi"),
  ).find((node) => node.textContent === text);

  if (!match) throw new Error(`missing ${text}`);

  return match;
}

function select_contents(node: Node): void {
  const range = document.createRange();

  range.selectNodeContents(node);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
}

function drag_click(target: HTMLElement): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, detail: 1 }),
    );
    target.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, detail: 1 }),
    );
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
}

describe("ThreadMessageBlock sender text selection", () => {
  it("marks the sender address as selectable", () => {
    render_block(true, () => {});

    expect(
      find_text("kosei@astermail.org").closest("[data-selectable]"),
    ).not.toBeNull();
  });

  it("does not collapse the message when a mouseup ends a selection of the address", () => {
    const on_toggle = vi.fn();

    render_block(true, on_toggle);
    const address = find_text("kosei@astermail.org");

    select_contents(address);
    expect(window.getSelection()!.toString()).toBe("kosei@astermail.org");
    drag_click(address);

    expect(on_toggle).not.toHaveBeenCalled();
  });

  it("still collapses the message on a plain click of the address", () => {
    const on_toggle = vi.fn();

    render_block(true, on_toggle);
    drag_click(find_text("kosei@astermail.org"));

    expect(on_toggle).toHaveBeenCalledTimes(1);
  });

  it("ignores a selection that lies outside the header", () => {
    const on_toggle = vi.fn();
    const outside = document.createElement("p");

    outside.textContent = "elsewhere";
    document.body.appendChild(outside);
    render_block(true, on_toggle);
    select_contents(outside);
    drag_click(find_text("kosei@astermail.org"));
    outside.remove();

    expect(on_toggle).toHaveBeenCalledTimes(1);
  });

  it("does not expand a collapsed row when a mouseup ends a selection of the name", () => {
    const on_toggle = vi.fn();

    render_block(false, on_toggle);
    const name = find_text("kosei");

    expect(name.hasAttribute("data-selectable")).toBe(true);
    select_contents(name);
    drag_click(name);

    expect(on_toggle).not.toHaveBeenCalled();
  });

  it("expands a collapsed row on a plain click", () => {
    const on_toggle = vi.fn();

    render_block(false, on_toggle);
    drag_click(find_text("kosei"));

    expect(on_toggle).toHaveBeenCalledTimes(1);
  });
});
