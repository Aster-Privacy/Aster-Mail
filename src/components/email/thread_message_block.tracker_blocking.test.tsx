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

const TRACKER_HOST = "trk.news.example";

const TRACKER_HTML = [
  "<html><head>",
  `<link rel="stylesheet" href="https://${TRACKER_HOST}/track/style.css">`,
  `<link rel="preload" as="image" href="https://${TRACKER_HOST}/pixel/preload.gif">`,
  `<style>.hero{background:url(https://${TRACKER_HOST}/pixel/hero.gif)} .plain{background:url(https://cdn.news.example/texture.png)}</style>`,
  "</head><body>",
  '<table width="600"><tr>',
  `<td class="hero" style="background-image:url('https://${TRACKER_HOST}/beacon/cell.gif')">`,
  '<img src="https://cdn.news.example/banner.png" alt="Autumn issue" width="600">',
  "<p>Rich layout paragraph.</p>",
  `<img src="https://${TRACKER_HOST}/assets/a.gif" width="1" height="1" srcset="https://${TRACKER_HOST}/assets/a2.gif 2x">`,
  '<img src="https://ad.doubleclick.net/ddm/activity.gif">',
  `<img src="https://${TRACKER_HOST}/assets/hidden.gif" style="display:none">`,
  `<img src="https://cdn.news.example/logo.png" alt="Logo" width="120" srcset="https://cdn.news.example/logo2x.png 2x, https://${TRACKER_HOST}/track/logo3x.png 3x">`,
  "</td>",
  `<td background="https://${TRACKER_HOST}/o.gif">Footer</td>`,
  "</tr></table></body></html>",
].join("");

function make_tracker_message(): DecryptedThreadMessage {
  return {
    id: "trk_1",
    item_type: "received",
    sender_name: "Garden Weekly",
    sender_email: "news@news.example",
    subject: "Autumn in the garden",
    body: TRACKER_HTML,
    html_content: TRACKER_HTML,
    timestamp: "2026-10-01T07:12:00.000Z",
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
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
  settings.preferences = {
    ...DEFAULT_PREFERENCES,
    load_remote_images: "ask",
    block_remote_images: true,
  };
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

async function render_block(granted: string[]): Promise<void> {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded
        is_single_message
        is_own_message={false}
        loaded_content_types={new Set(granted)}
        message={make_tracker_message()}
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

function rendered_document(): Document {
  const body = probe.bodies.at(-1);

  expect(body).toBeDefined();

  return new DOMParser().parseFromString(body!.html, "text/html");
}

function decoded(value: string): string {
  let current = value;

  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(current);

      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }

  return current;
}

function fetchable_values(doc: Document): string[] {
  const values: string[] = [];

  doc.querySelectorAll("*").forEach((el) => {
    for (const name of ["src", "srcset", "background", "href", "style"]) {
      const value = el.getAttribute(name);

      if (value) values.push(decoded(value));
    }
  });
  doc.querySelectorAll("style").forEach((el) => {
    values.push(decoded(el.textContent || ""));
  });

  return values;
}

function tracker_leaks(doc: Document): string[] {
  return fetchable_values(doc).filter(
    (value) => value.includes(TRACKER_HOST) || value.includes("doubleclick"),
  );
}

function img_with_alt(doc: Document, alt: string): HTMLImageElement {
  const img = doc.querySelector<HTMLImageElement>(`img[alt='${alt}']`);

  expect(img).not.toBe(null);

  return img!;
}

async function show_content(): Promise<void> {
  await render_block([]);

  const button = container!.querySelector<HTMLButtonElement>(
    "[data-testid='load-external-content']",
  );

  expect(button).not.toBe(null);
  act(() => {
    button!.click();
  });
  expect(load_requests).toHaveLength(1);
  expect(load_requests[0].types).not.toContain("tracking_pixel");
  await render_block(load_requests[0].types ?? []);
}

describe("ThreadMessageBlock tracker blocking", () => {
  it("keeps every remote url out of the message before content is shown", async () => {
    await render_block([]);

    const doc = rendered_document();

    expect(tracker_leaks(doc)).toEqual([]);
    expect(
      img_with_alt(doc, "Autumn issue").getAttribute("src") ?? "",
    ).not.toContain("cdn.news.example");
  });

  it("loads only the normal images through the proxy after show content", async () => {
    await show_content();

    const doc = rendered_document();
    const banner_src = img_with_alt(doc, "Autumn issue").getAttribute("src");

    expect(banner_src).toContain("/api/images/v1/proxy?url=");
    expect(decoded(banner_src!)).toContain(
      "https://cdn.news.example/banner.png",
    );
    expect(decoded(img_with_alt(doc, "Logo").getAttribute("src")!)).toContain(
      "https://cdn.news.example/logo.png",
    );
    expect(tracker_leaks(doc)).toEqual([]);
  });

  it("never gives a tracker image a src after show content", async () => {
    await show_content();

    const doc = rendered_document();
    const loaded = Array.from(doc.querySelectorAll("img"))
      .map((img) => img.getAttribute("src"))
      .filter((src): src is string => Boolean(src))
      .filter((src) => !src.startsWith("data:"))
      .map(decoded);

    expect(loaded).toHaveLength(2);
    expect(loaded.every((src) => src.includes("cdn.news.example"))).toBe(true);
    expect(
      doc.querySelectorAll("img[data-tracking-pixel='true']").length,
    ).toBeGreaterThanOrEqual(3);
    doc.querySelectorAll("img[data-tracking-pixel='true']").forEach((img) => {
      expect(img.getAttribute("src") ?? "").not.toMatch(/^https?:|\/proxy/);
      expect(img.getAttribute("srcset")).toBe(null);
    });
  });

  it("reports the blocked trackers separately from hidden content", async () => {
    await render_block([]);

    const before = container!.querySelector("[data-testid='trackers-blocked']");

    expect(before?.textContent).toBe("mail.trackers_blocked_count");
    expect(blocked_types()).toContain("tracking_pixel");

    await show_content();

    expect(
      container!.querySelector("[data-testid='load-external-content']"),
    ).toBe(null);
    expect(
      container!.querySelector("[data-testid='trackers-blocked']"),
    ).not.toBe(null);
    expect(reports.at(-1)!.has_tracking_pixels).toBe(true);
  });
});

function blocked_types(): string[] {
  const report = reports.at(-1);

  expect(report).toBeDefined();

  return report!.blocked_items.map((item) => item.type);
}
