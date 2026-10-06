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

vi.mock("@/components/email/sandboxed_email_renderer", () => ({
  get_cached_iframe_height: () => undefined,
  SandboxedEmailRenderer: (props: {
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

vi.mock("@/components/mobile/mobile_bottom_sheet", () => ({
  MobileBottomSheet: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: () => {} }));

const settings = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => settings,
}));

const { DEFAULT_PREFERENCES } = await import("@/services/api/preferences");
const { MobileThreadMessage } = await import("./mobile_thread_message");
const { MobileActionMenuSheet } = await import("./mobile_detail_sheets");
const { clear_plain_view_overrides, set_plain_view_override } =
  await import("@/components/email/plain_view_store");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NEWSLETTER_HTML = [
  '<html><head><link rel="stylesheet" href="https://cdn.news.example/style.css"></head><body>',
  '<table width="600"><tr><td>',
  '<img src="https://cdn.news.example/banner.png" alt="Autumn issue">',
  "<h1>Autumn in the garden</h1><p>Rich layout paragraph.</p>",
  '<img src="https://track.news.example/open.gif" width="1" height="1">',
  "</td></tr></table></body></html>",
].join("");

const TEXT_PART =
  "Autumn in the garden\n\nPlain text paragraph from the sender.";

function make_message(
  extra: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id: "news_1",
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

async function flush(): Promise<void> {
  await act(async () => {
    vi.runAllTimers();
  });
}

async function render_message(message: DecryptedThreadMessage): Promise<void> {
  act(() => {
    root!.render(
      <MobileThreadMessage
        is_expanded
        format_detail={() => "Oct 1, 2026"}
        is_own_message={false}
        load_remote_content={true}
        message={message}
        on_external_content_detected={(report) => reports.push(report)}
        on_forward={() => {}}
        on_open_menu={() => {}}
        on_reply={() => {}}
        on_toggle={() => {}}
        t={(key) => key}
      />,
    );
  });
  await flush();
}

function last_body() {
  const body = probe.bodies.at(-1);

  expect(body).toBeDefined();

  return body!;
}

function expect_nothing_remote(html: string): void {
  const doc = new DOMParser().parseFromString(html, "text/html");

  expect(doc.querySelector("img, link, style")).toBe(null);
  expect(doc.querySelector("[src], [srcset], [style]")).toBe(null);
  expect(html).not.toContain("cdn.news.example");
  expect(html).not.toContain("track.news.example");
}

describe("MobileThreadMessage plain text view", () => {
  it("opens the text part when the setting is on", async () => {
    settings.preferences = {
      ...DEFAULT_PREFERENCES,
      prefer_plain_text: true,
    };
    await render_message(make_message());

    const body = last_body();

    expect(body.is_plain_text).toBe(true);
    expect(body.load_remote_content).toBe(false);
    expect(body.html).toContain("Plain text paragraph from the sender.");
    expect_nothing_remote(body.html);
    expect(probe.sanitize_calls).toBe(0);
    expect(reports).toHaveLength(0);
  });

  it("shows the text part after the menu toggle and restores HTML", async () => {
    await render_message(make_message());

    expect(last_body().html).toContain("Rich layout paragraph");

    act(() => set_plain_view_override("news_1", true));
    await flush();

    expect(last_body().html).toContain("Plain text paragraph from the sender.");
    expect(last_body().html).not.toContain("Rich layout paragraph");

    act(() => set_plain_view_override("news_1", false));
    await flush();

    expect(last_body().is_plain_text).toBe(false);
    expect(last_body().html).toContain("Rich layout paragraph");
  });

  it("converts HTML-only messages and keeps them HTML under the setting", async () => {
    settings.preferences = {
      ...DEFAULT_PREFERENCES,
      prefer_plain_text: true,
    };
    await render_message(make_message({ text_part: undefined }));

    expect(last_body().html).toContain("Rich layout paragraph");

    act(() => set_plain_view_override("news_1", true));
    await flush();

    const body = last_body();

    expect(body.is_plain_text).toBe(true);
    expect(body.html).toContain("Rich layout paragraph.");
    expect_nothing_remote(body.html);
  });
});

describe("MobileActionMenuSheet plain text item", () => {
  function render_sheet(
    plain_view: { available: boolean; active: boolean },
    on_toggle_plain_view: () => void,
  ): void {
    const noop = () => {};

    act(() => {
      root!.render(
        <MobileActionMenuSheet
          format_detail={() => "today"}
          is_all_dark={false}
          is_message_dark={false}
          is_pinned={false}
          is_spam={false}
          is_starred={false}
          menu_message={make_message()}
          menu_source="message"
          on_archive={noop}
          on_block={noop}
          on_close={noop}
          on_copy_id={noop}
          on_customize_toolbar={noop}
          on_forward={noop}
          on_message_details={noop}
          on_not_spam={noop}
          on_print={noop}
          on_reply={noop}
          on_reply_all={noop}
          on_report_phishing={noop}
          on_snooze={noop}
          on_spam={noop}
          on_toggle_all_dark_mode={noop}
          on_toggle_dark_mode={noop}
          on_toggle_pin={noop}
          on_toggle_plain_view={on_toggle_plain_view}
          on_toggle_read={noop}
          on_toggle_star={noop}
          on_trash={noop}
          on_view_source={noop}
          plain_view={plain_view}
          t={(key) => key}
        />,
      );
    });
  }

  function find_button(label: string): HTMLButtonElement | null {
    return (
      Array.from(container!.querySelectorAll("button")).find(
        (button) => button.textContent === label,
      ) ?? null
    );
  }

  it("offers plain text and then the original", () => {
    const on_toggle = vi.fn();

    render_sheet({ available: true, active: false }, on_toggle);
    act(() => find_button("mail.show_plain_text")!.click());
    expect(on_toggle).toHaveBeenCalledTimes(1);

    render_sheet({ available: true, active: true }, on_toggle);
    expect(find_button("mail.show_plain_text")).toBe(null);
    expect(find_button("mail.show_original")).not.toBe(null);
  });

  it("hides the item for messages without HTML", () => {
    render_sheet({ available: false, active: false }, () => {});

    expect(find_button("mail.show_plain_text")).toBe(null);
    expect(find_button("mail.show_original")).toBe(null);
  });
});
