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
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const probe = vi.hoisted(() => ({
  sanitize_calls: 0,
  bodies: [] as {
    html: string;
    is_plain_text: boolean;
    load_remote_content: boolean;
  }[],
}));

vi.mock("@/lib/html_sanitizer", async (import_original) => {
  const actual = await import_original<typeof import("@/lib/html_sanitizer")>();

  return {
    ...actual,
    sanitize_html: (
      ...args: Parameters<typeof actual.sanitize_html>
    ): ReturnType<typeof actual.sanitize_html> => {
      probe.sanitize_calls += 1;

      return actual.sanitize_html(...args);
    },
  };
});

vi.mock("@/components/ui/dropdown_menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Item = ({
    children,
    onClick,
  }: {
    children?: ReactNode;
    onClick?: (event: { stopPropagation: () => void }) => void;
  }) => (
    <button
      role="menuitem"
      type="button"
      onClick={() => onClick?.({ stopPropagation: () => {} })}
    >
      {children}
    </button>
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
  ThreadMessageBody: (props: {
    sanitized_html: string;
    is_plain_text: boolean;
    load_remote_content: boolean;
  }) => {
    probe.bodies.push({
      html: props.sanitized_html,
      is_plain_text: props.is_plain_text,
      load_remote_content: props.load_remote_content,
    });

    return <div data-testid="message-body" />;
  },
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
const { clear_plain_view_overrides } = await import("./plain_view_store");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NEWSLETTER_HTML = [
  "<html><head>",
  '<link rel="stylesheet" href="https://cdn.news.example/style.css">',
  "<style>@import url(https://cdn.news.example/fonts.css); .hero{background:url(https://cdn.news.example/bg.png)}</style>",
  "</head><body>",
  '<table width="600"><tr><td class="hero">',
  '<img src="https://cdn.news.example/banner.png" alt="Autumn issue">',
  "<h1>Autumn in the garden</h1>",
  "<p>Rich layout paragraph.</p>",
  '<img src="https://track.news.example/open.gif" width="1" height="1">',
  "</td></tr></table></body></html>",
].join("");

const TEXT_PART =
  "Autumn in the garden\n\nPlain text paragraph from the sender.\n\nRead online: https://news.example/autumn";

const REMOTE_HOSTS = ["cdn.news.example", "track.news.example"];

function make_message(
  id: string,
  extra: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Garden Weekly",
    sender_email: "news@news.example",
    subject: "Autumn in the garden",
    body: NEWSLETTER_HTML,
    html_content: NEWSLETTER_HTML,
    text_part: TEXT_PART,
    timestamp: "2026-10-01T07:12:00.000Z",
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
    ...extra,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let reports: ExternalContentReport[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  probe.sanitize_calls = 0;
  probe.bodies.length = 0;
  reports = [];
  clear_plain_view_overrides();
  settings.preferences = { ...DEFAULT_PREFERENCES };
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
  vi.useRealTimers();
});

async function render_block(message: DecryptedThreadMessage): Promise<void> {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded
        is_single_message
        is_own_message={false}
        message={message}
        on_external_content_detected={(report) => reports.push(report)}
        on_toggle={() => {}}
      />,
    );
  });
  await act(async () => {
    vi.runAllTimers();
  });
}

function menu_item(label: string): HTMLButtonElement | null {
  return (
    Array.from(
      container!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ).find((item) => item.textContent?.includes(label)) ?? null
  );
}

async function click_menu_item(label: string): Promise<void> {
  const item = menu_item(label);

  expect(item).not.toBe(null);
  act(() => {
    item!.click();
  });
  await act(async () => {
    vi.runAllTimers();
  });
}

function last_body() {
  const body = probe.bodies.at(-1);

  expect(body).toBeDefined();

  return body!;
}

function expect_nothing_remote(html: string): void {
  const doc = new DOMParser().parseFromString(html, "text/html");

  expect(doc.querySelector("img, link, style, picture, video, source")).toBe(
    null,
  );
  expect(doc.querySelector("[src], [srcset], [background], [style]")).toBe(
    null,
  );
  expect(html).not.toMatch(/url\s*\(/i);
  expect(html).not.toMatch(/@import/i);
  for (const host of REMOTE_HOSTS) expect(html).not.toContain(host);
}

describe("ThreadMessageBlock plain text view", () => {
  it("shows the sender's text part from the message menu", async () => {
    await render_block(make_message("news_1"));

    expect(last_body().html).toContain("Rich layout paragraph");
    expect(menu_item("mail.show_original")).toBe(null);

    await click_menu_item("mail.show_plain_text");

    const body = last_body();

    expect(body.is_plain_text).toBe(true);
    expect(body.html).toContain("Plain text paragraph from the sender.");
    expect(body.html).not.toContain("Rich layout paragraph");
    expect(menu_item("mail.show_original")).not.toBe(null);
  });

  it("puts nothing that loads remotely into the plain view", async () => {
    await render_block(make_message("news_1"));
    await click_menu_item("mail.show_plain_text");

    const body = last_body();

    expect(body.load_remote_content).toBe(false);
    expect_nothing_remote(body.html);
  });

  it("opens plain by default when the setting is on and a text part exists", async () => {
    settings.preferences = {
      ...DEFAULT_PREFERENCES,
      prefer_plain_text: true,
    };
    await render_block(make_message("news_1"));

    expect(probe.sanitize_calls).toBe(0);
    expect(reports).toHaveLength(0);
    expect(probe.bodies.length).toBeGreaterThan(0);
    for (const body of probe.bodies) {
      expect(body.html).not.toContain("Rich layout paragraph");
      expect_nothing_remote(body.html);
    }
    expect(last_body().html).toContain("Plain text paragraph from the sender.");
    expect(menu_item("mail.show_original")).not.toBe(null);
  });

  it("finds the text part in the body of a single-message envelope", async () => {
    settings.preferences = {
      ...DEFAULT_PREFERENCES,
      prefer_plain_text: true,
    };
    await render_block(
      make_message("news_1", { body: TEXT_PART, text_part: undefined }),
    );

    expect(last_body().html).toContain("Plain text paragraph from the sender.");
    expect(probe.sanitize_calls).toBe(0);
  });

  it("keeps HTML-only messages as HTML when the setting is on", async () => {
    settings.preferences = {
      ...DEFAULT_PREFERENCES,
      prefer_plain_text: true,
    };
    await render_block(make_message("news_1", { text_part: undefined }));

    expect(last_body().html).toContain("Rich layout paragraph");
    expect(probe.sanitize_calls).toBe(1);
    expect(menu_item("mail.show_plain_text")).not.toBe(null);
  });

  it("converts HTML-only messages to readable text from the menu", async () => {
    await render_block(make_message("news_1", { text_part: undefined }));
    await click_menu_item("mail.show_plain_text");

    const body = last_body();

    expect(body.is_plain_text).toBe(true);
    expect(body.html).toContain("Autumn in the garden");
    expect(body.html).toContain("Rich layout paragraph.");
    expect_nothing_remote(body.html);
  });

  it("restores the HTML when toggled back", async () => {
    settings.preferences = {
      ...DEFAULT_PREFERENCES,
      prefer_plain_text: true,
    };
    await render_block(make_message("news_1"));

    expect(last_body().html).not.toContain("Rich layout paragraph");

    await click_menu_item("mail.show_original");

    const body = last_body();

    expect(body.is_plain_text).toBe(false);
    expect(body.html).toContain("Rich layout paragraph");
    expect(probe.sanitize_calls).toBe(1);
    expect(menu_item("mail.show_plain_text")).not.toBe(null);
  });

  it("keeps the choice per message", async () => {
    await render_block(make_message("news_1"));
    await click_menu_item("mail.show_plain_text");
    await render_block(make_message("news_2"));

    expect(last_body().html).toContain("Rich layout paragraph");
    expect(menu_item("mail.show_plain_text")).not.toBe(null);
  });

  it("offers no toggle when HTML rendering is blocked", async () => {
    settings.preferences = {
      ...DEFAULT_PREFERENCES,
      html_rendering_mode: "plain_text",
    };
    await render_block(make_message("news_1"));

    expect(menu_item("mail.show_plain_text")).toBe(null);
    expect(menu_item("mail.show_original")).toBe(null);
  });
});
