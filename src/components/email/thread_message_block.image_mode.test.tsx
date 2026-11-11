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
let load_requests: { id: string; types: string[] | undefined }[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  probe.sanitize_calls = 0;
  probe.bodies.length = 0;
  reports = [];
  load_requests = [];
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

async function render_block(granted: string[] = []): Promise<void> {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded
        is_single_message
        is_own_message={false}
        loaded_content_types={new Set(granted)}
        message={make_message("news_1")}
        on_external_content_detected={(report) => reports.push(report)}
        on_load_external_content={(id, types) =>
          load_requests.push({ id, types })
        }
        on_toggle={() => {}}
      />,
    );
  });
  await act(async () => {
    vi.runAllTimers();
  });
}

function load_buttons(): HTMLButtonElement[] {
  return Array.from(
    container!.querySelectorAll<HTMLButtonElement>("button"),
  ).filter((button) =>
    button.textContent?.includes("mail.load_external_content"),
  );
}

function settings_button(): HTMLButtonElement | null {
  return container!.querySelector<HTMLButtonElement>(
    "[data-testid='image-loading-settings']",
  );
}

function blocked_types(): string[] {
  const report = reports.at(-1);

  expect(report).toBeDefined();

  return report!.blocked_items.map((item) => item.type);
}

function use_image_mode(mode: "always" | "ask" | "never") {
  settings.preferences = {
    ...DEFAULT_PREFERENCES,
    load_remote_images: mode,
    block_remote_images: mode !== "always",
  };
}

describe("ThreadMessageBlock image loading modes", () => {
  it("offers no way to load images in a message when images never load", async () => {
    use_image_mode("never");
    await render_block();

    expect(blocked_types()).toContain("image");
    expect(
      load_buttons().filter((button) =>
        /mail\.images?\b|mail\.trackers?\b/.test(button.textContent ?? ""),
      ),
    ).toHaveLength(0);
    expect(settings_button()).not.toBe(null);
  });

  it("opens the image setting from a message when images never load", async () => {
    const targets: unknown[] = [];
    const listener = (event: Event) =>
      targets.push((event as CustomEvent).detail);

    window.addEventListener("navigate-settings", listener);
    use_image_mode("never");
    await render_block();
    act(() => {
      settings_button()!.click();
    });
    window.removeEventListener("navigate-settings", listener);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ section: "security" });
    expect(load_requests).toHaveLength(0);
  });

  it("keeps images blocked when an earlier choice exists and images never load", async () => {
    use_image_mode("never");
    await render_block(["image", "tracking_pixel"]);

    expect(blocked_types()).toContain("image");
    expect(blocked_types()).toContain("tracking_pixel");
    expect(probe.bodies.at(-1)?.load_remote_content).toBe(false);
  });

  it("offers a per-message choice when the setting asks first", async () => {
    use_image_mode("ask");
    await render_block();

    expect(blocked_types()).toContain("image");
    expect(settings_button()).toBe(null);

    const image_button = load_buttons().find((button) =>
      /mail\.images?\b/.test(button.textContent ?? ""),
    );

    expect(image_button).toBeDefined();
    act(() => {
      image_button!.click();
    });
    expect(load_requests).toEqual([{ id: "news_1", types: ["image"] }]);
  });

  it("loads images for a message the reader allowed when the setting asks first", async () => {
    use_image_mode("ask");
    await render_block(["image"]);

    expect(blocked_types()).not.toContain("image");
    expect(blocked_types()).toContain("tracking_pixel");
  });

  it("loads images without a prompt when images always load", async () => {
    use_image_mode("always");
    await render_block();

    expect(reports.at(-1)?.blocked_items ?? []).not.toContainEqual(
      expect.objectContaining({ type: "image" }),
    );
    expect(settings_button()).toBe(null);
    expect(
      load_buttons().filter((button) =>
        /mail\.images?\b/.test(button.textContent ?? ""),
      ),
    ).toHaveLength(0);
  });
});
