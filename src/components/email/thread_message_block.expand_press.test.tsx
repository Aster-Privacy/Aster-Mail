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
  ThreadMessageBody: () => <div data-testid="message_body" />,
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

const { start_press_feedback, PRESS_ATTRIBUTE } = await import(
  "@/lib/press_feedback"
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let stop_press: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "performance",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });
  settings.preferences = { ...DEFAULT_PREFERENCES };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  stop_press = start_press_feedback();
});

afterEach(() => {
  stop_press();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

function render_block(is_expanded: boolean, on_toggle: () => void): void {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded={is_expanded}
        is_last_displayed={false}
        is_last_in_thread={false}
        is_own_message={false}
        is_single_message={false}
        message={message}
        on_toggle={on_toggle}
      />,
    );
  });
}

function collapsed_row(): HTMLElement {
  const row = container!.querySelector<HTMLElement>(
    '[role="button"][data-ripple]',
  );

  if (!row) throw new Error("missing collapsed row");

  return row;
}

function pressed_nodes(): Element[] {
  return Array.from(container!.querySelectorAll(`[${PRESS_ATTRIBUTE}]`));
}

function pointer(type: string, target: Element): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 4,
      clientY: 4,
    }),
  );
}

function key(type: string, target: Element, name: string): void {
  target.dispatchEvent(
    new KeyboardEvent(type, { bubbles: true, cancelable: true, key: name }),
  );
}

function settle(): void {
  act(() => {
    vi.advanceTimersByTime(16);
  });
}

describe("ThreadMessageBlock expand press state", () => {
  it("drops the ripple when a click expands a collapsed message", () => {
    let expanded = false;

    render_block(false, () => {
      expanded = true;
    });
    const row = collapsed_row();

    act(() => {
      pointer("pointerdown", row);
    });
    expect(row.hasAttribute(PRESS_ATTRIBUTE)).toBe(true);
    act(() => {
      pointer("pointerup", row);
      row.click();
    });
    expect(expanded).toBe(true);
    render_block(true, () => {});
    settle();

    expect(row.isConnected).toBe(false);
    expect(pressed_nodes()).toEqual([]);
    expect(container!.querySelector('[style*="--aster-ripple"]')).toBeNull();
  });

  it("drops the ripple when Enter or Space expands a collapsed message", () => {
    for (const name of ["Enter", " "]) {
      let expanded = false;

      render_block(false, () => {
        expanded = true;
      });
      const row = collapsed_row();

      row.focus();
      act(() => {
        key("keydown", row, name);
      });
      expect(expanded).toBe(true);
      render_block(true, () => {});
      act(() => {
        key("keyup", document.body, name);
      });
      settle();

      expect(row.isConnected).toBe(false);
      expect(pressed_nodes()).toEqual([]);
      act(() => {
        vi.runAllTimers();
      });
      render_block(false, () => {});
    }
  });

  it("renders an expanded message the same as one open from the start", () => {
    render_block(false, () => {});
    const row = collapsed_row();

    act(() => {
      pointer("pointerdown", row);
      pointer("pointerup", row);
    });
    render_block(true, () => {});
    settle();
    const after_expand = container!.innerHTML;

    act(() => {
      vi.runAllTimers();
      root!.unmount();
    });
    root = createRoot(container!);
    render_block(true, () => {});

    expect(after_expand).toBe(container!.innerHTML);
  });

  it("keeps space between the message body and the reply actions", () => {
    render_block(true, () => {});
    const body = container!.querySelector(
      '[data-testid="message_body"], div[aria-hidden="true"][style*="height"]',
    );
    const wrapper = body?.closest("div.pt-1");

    expect(wrapper).toBeTruthy();
    expect(wrapper!.className).not.toMatch(/\bpb-0\b/);
    expect(wrapper!.className).toMatch(/\bpb-[1-9]/);
  });
});
