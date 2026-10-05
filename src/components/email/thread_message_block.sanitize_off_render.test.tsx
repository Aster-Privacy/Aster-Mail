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
import type { PreloadedSanitizedContent } from "@/components/email/hooks/preload_cache";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const probe = vi.hoisted(() => ({
  sanitize_calls: 0,
  should_throw: false,
  sanitized_outputs: new Set<string>(),
  bodies: [] as { email_id?: string; html: string }[],
}));

vi.mock("@/lib/html_sanitizer", async (import_original) => {
  const actual = await import_original<typeof import("@/lib/html_sanitizer")>();

  return {
    ...actual,
    sanitize_html: (
      ...args: Parameters<typeof actual.sanitize_html>
    ): ReturnType<typeof actual.sanitize_html> => {
      probe.sanitize_calls += 1;
      if (probe.should_throw) throw new RangeError("sanitizer failed");
      const result = actual.sanitize_html(...args);

      probe.sanitized_outputs.add(result.html);

      return result;
    },
  };
});

vi.mock("@/components/email/thread_message_body", () => ({
  ThreadMessageBody: (props: { sanitized_html: string; email_id?: string }) => {
    probe.bodies.push({ email_id: props.email_id, html: props.sanitized_html });

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
  SenderProfileTrigger: ({ children }: { children: React.ReactNode }) => (
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

const RAW_MARKER = "raw-unsanitized-marker";
const RAW_HTML = `<html><body><p>Weekly digest</p><img src="x" onerror="window.${RAW_MARKER}=1"><script>window.${RAW_MARKER}=2</script><a href="javascript:void(0)">link</a></body></html>`;

function make_message(id: string, html = RAW_HTML): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Example Weekly",
    sender_email: "news@example.com",
    subject: "Five small habits",
    body: "Weekly digest",
    html_content: html,
    timestamp: "2026-10-01T07:12:00.000Z",
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  probe.sanitize_calls = 0;
  probe.should_throw = false;
  probe.sanitized_outputs.clear();
  probe.bodies.length = 0;
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render_block(
  message: DecryptedThreadMessage,
  extra: { preloaded_sanitized?: PreloadedSanitizedContent } = {},
): void {
  act(() => {
    root!.render(
      <ThreadMessageBlock
        is_expanded
        is_single_message
        is_own_message={false}
        message={message}
        on_toggle={() => {}}
        {...extra}
      />,
    );
  });
}

async function flush_scheduled(): Promise<void> {
  await act(async () => {
    vi.runAllTimers();
  });
}

function body_is_mounted(): boolean {
  return container!.querySelector('[data-testid="message-body"]') !== null;
}

function expect_inert_fallback(html: string): void {
  expect(html).toContain("Weekly digest");
  expect(html).not.toContain(RAW_MARKER);
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("onerror");
  expect(html).not.toContain("javascript:");
}

function header_text(): string {
  return container!.textContent ?? "";
}

function expect_only_sanitized_bodies(): void {
  for (const body of probe.bodies) {
    expect(body.html).not.toContain(RAW_MARKER);
    expect(body.html).not.toContain("<script");
    expect(probe.sanitized_outputs.has(body.html)).toBe(true);
  }
}

describe("ThreadMessageBlock sanitizing off the first render", () => {
  it("commits the header before the body is sanitized", async () => {
    render_block(make_message("news_1"));

    expect(header_text()).toContain("Example Weekly");
    expect(probe.sanitize_calls).toBe(0);
    expect(probe.bodies).toHaveLength(0);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
    expect(probe.bodies.length).toBeGreaterThan(0);
    expect(probe.bodies.at(-1)!.html).toContain("Weekly digest");
    expect_only_sanitized_bodies();
  });

  it("never hands unsanitized markup to the body renderer", async () => {
    render_block(make_message("news_1"));
    await flush_scheduled();
    render_block(make_message("news_2", RAW_HTML.replace("Weekly", "Daily")));

    expect(
      probe.bodies.filter((body) => body.email_id === "news_2"),
    ).toHaveLength(0);

    await flush_scheduled();

    const second = probe.bodies.filter((body) => body.email_id === "news_2");

    expect(second.length).toBeGreaterThan(0);
    expect(second.every((body) => body.html.includes("Daily digest"))).toBe(
      true,
    );
    expect(probe.bodies.length).toBeGreaterThan(0);
    expect_only_sanitized_bodies();
  });

  it("re-sanitizes a message already on screen in the same render", async () => {
    render_block(make_message("news_1"));
    await flush_scheduled();
    const shown = probe.bodies.length;

    settings.preferences = {
      ...settings.preferences,
      block_remote_images: false,
    };
    render_block(make_message("news_1"));

    expect(probe.sanitize_calls).toBe(2);
    expect(probe.bodies.length).toBeGreaterThan(shown);
    expect(container!.querySelector('[data-testid="message-body"]')).not.toBe(
      null,
    );

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(2);
    expect_only_sanitized_bodies();
  });

  it("does not sanitize again when the preloaded result is used", async () => {
    const preloaded: PreloadedSanitizedContent = {
      html: "<p>Weekly digest, already clean</p>",
      external_content: {
        has_remote_images: false,
        has_remote_fonts: false,
        has_remote_css: false,
        has_tracking_pixels: false,
        blocked_count: 0,
        blocked_items: [],
        cleaned_links: [],
      },
      is_plain_text: false,
    };

    probe.sanitized_outputs.add(preloaded.html);
    render_block(make_message("news_1"), { preloaded_sanitized: preloaded });

    expect(probe.bodies.at(-1)?.html).toBe(preloaded.html);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(0);
    expect_only_sanitized_bodies();
  });

  it("shows the readable fallback when the deferred sanitize throws", async () => {
    probe.should_throw = true;
    render_block(make_message("news_1"));

    expect(probe.bodies).toHaveLength(0);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
    expect(body_is_mounted()).toBe(true);
    expect(probe.bodies.length).toBeGreaterThan(0);
    for (const body of probe.bodies) expect_inert_fallback(body.html);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
  });

  it("shows the readable fallback when a same-render sanitize throws", async () => {
    render_block(make_message("news_1"));
    await flush_scheduled();
    const shown = probe.bodies.length;

    probe.should_throw = true;
    settings.preferences = {
      ...settings.preferences,
      block_remote_images: false,
    };
    render_block(make_message("news_1"));

    expect(probe.sanitize_calls).toBe(2);
    expect(body_is_mounted()).toBe(true);
    expect(probe.bodies.length).toBeGreaterThan(shown);
    for (const body of probe.bodies.slice(shown)) {
      expect_inert_fallback(body.html);
    }
  });

  it("shows the readable fallback when the preloaded result is unusable", async () => {
    const preloaded = {
      get html(): string {
        throw new Error("preload unavailable");
      },
    } as unknown as PreloadedSanitizedContent;

    render_block(make_message("news_1"), { preloaded_sanitized: preloaded });

    expect(probe.sanitize_calls).toBe(0);
    expect(probe.bodies.length).toBeGreaterThan(0);
    for (const body of probe.bodies) expect_inert_fallback(body.html);
  });

  it("keeps message markup out of the placeholder", () => {
    render_block(make_message("news_1"));

    const markup = container!.innerHTML;

    expect(body_is_mounted()).toBe(false);
    expect(markup).not.toContain(RAW_MARKER);
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("onerror");
    expect(markup).not.toContain("javascript:");
    expect(container!.querySelector("iframe")).toBe(null);
  });

  it("drops the scheduled sanitize when the message changes first", async () => {
    render_block(make_message("news_1"));
    render_block(make_message("news_2", RAW_HTML.replace("Weekly", "Daily")));

    expect(probe.sanitize_calls).toBe(0);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
    expect(probe.bodies.length).toBeGreaterThan(0);
    expect(probe.bodies.every((body) => body.email_id === "news_2")).toBe(true);
    expect(probe.bodies.every((body) => body.html.includes("Daily"))).toBe(
      true,
    );
    expect_only_sanitized_bodies();
  });

  it("sanitizes again for a different message with the same body", async () => {
    render_block(make_message("news_1"));
    await flush_scheduled();
    render_block(make_message("news_2"));

    expect(
      probe.bodies.filter((body) => body.email_id === "news_2"),
    ).toHaveLength(0);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(2);
    expect(
      probe.bodies.filter((body) => body.email_id === "news_2").length,
    ).toBeGreaterThan(0);
    expect_only_sanitized_bodies();
  });

  it("drops the scheduled sanitize when the block unmounts first", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    render_block(make_message("news_1"));
    act(() => {
      root!.unmount();
    });
    root = null;

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(0);
    expect(probe.bodies).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("sanitizes once and keeps the body mounted across re-renders", async () => {
    const message = make_message("news_1");

    render_block(message);
    await flush_scheduled();

    for (let pass = 0; pass < 5; pass += 1) {
      render_block(message);
      expect(body_is_mounted()).toBe(true);
      render_block(make_message("news_1"));
      expect(body_is_mounted()).toBe(true);
      await flush_scheduled();
    }

    expect(probe.sanitize_calls).toBe(1);
    expect(new Set(probe.bodies.map((body) => body.html)).size).toBe(1);
    expect_only_sanitized_bodies();
  });

  it("still shows the body when frame callbacks are unavailable", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    vi.stubGlobal("cancelAnimationFrame", undefined);
    render_block(make_message("news_1"));

    expect(probe.bodies).toHaveLength(0);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
    expect(body_is_mounted()).toBe(true);
    expect_only_sanitized_bodies();
  });

  it("still shows the body when no frame is ever produced", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    render_block(make_message("news_1"));

    await act(async () => {
      vi.advanceTimersByTime(99);
    });

    expect(probe.sanitize_calls).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(probe.sanitize_calls).toBe(1);
    expect(body_is_mounted()).toBe(true);
    expect_only_sanitized_bodies();
  });
});
