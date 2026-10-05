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

vi.mock("@/components/email/sandboxed_email_renderer", () => ({
  get_cached_iframe_height: () => undefined,
  SandboxedEmailRenderer: (props: {
    sanitized_html: string;
    email_id?: string;
  }) => {
    probe.bodies.push({ email_id: props.email_id, html: props.sanitized_html });

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

const settings = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => settings,
}));

const { DEFAULT_PREFERENCES } = await import("@/services/api/preferences");
const { MobileThreadMessage } = await import("./mobile_thread_message");

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
let reports: ExternalContentReport[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  probe.sanitize_calls = 0;
  probe.should_throw = false;
  probe.sanitized_outputs.clear();
  probe.bodies.length = 0;
  reports = [];
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

const on_external_content_detected = (report: ExternalContentReport) => {
  reports.push(report);
};

function render_message(
  message: DecryptedThreadMessage,
  is_expanded = true,
): void {
  act(() => {
    root!.render(
      <MobileThreadMessage
        format_detail={() => "Oct 1, 2026"}
        is_expanded={is_expanded}
        is_own_message={false}
        load_remote_content={false}
        message={message}
        on_external_content_detected={on_external_content_detected}
        on_forward={() => {}}
        on_open_menu={() => {}}
        on_reply={() => {}}
        on_toggle={() => {}}
        t={(key) => key}
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

function placeholder(): Element | null {
  return container!.querySelector('div[aria-hidden="true"][style]');
}

function expect_inert_fallback(html: string): void {
  expect(html).toContain("Weekly digest");
  expect(html).not.toContain(RAW_MARKER);
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("onerror");
  expect(html).not.toContain("javascript:");
}

function expect_only_sanitized_bodies(): void {
  for (const body of probe.bodies) {
    expect(body.html).not.toContain(RAW_MARKER);
    expect(body.html).not.toContain("<script");
    expect(probe.sanitized_outputs.has(body.html)).toBe(true);
  }
}

describe("MobileThreadMessage sanitizing off the first render", () => {
  it("commits the header and actions before the body is sanitized", async () => {
    render_message(make_message("news_1"));

    expect(container!.textContent).toContain("Example Weekly");
    expect(container!.textContent).toContain("mail.reply");
    expect(probe.sanitize_calls).toBe(0);
    expect(probe.bodies).toHaveLength(0);
    expect(placeholder()).not.toBe(null);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
    expect(placeholder()).toBe(null);
    expect(probe.bodies.length).toBeGreaterThan(0);
    expect(probe.bodies.at(-1)!.html).toContain("Weekly digest");
    expect_only_sanitized_bodies();
  });

  it("never hands unsanitized markup to the body renderer", async () => {
    render_message(make_message("news_1"));

    expect(probe.bodies).toHaveLength(0);
    expect(container!.querySelector("iframe")).toBe(null);

    const markup = container!.innerHTML;

    expect(markup).not.toContain(RAW_MARKER);
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("onerror");

    await flush_scheduled();
    render_message(make_message("news_2", RAW_HTML.replace("Weekly", "Daily")));
    await flush_scheduled();

    expect(probe.bodies.length).toBeGreaterThan(0);
    expect_only_sanitized_bodies();
  });

  it("never shows the previous message's body after a switch", async () => {
    render_message(make_message("news_1"));
    await flush_scheduled();
    const shown = probe.bodies.length;

    render_message(make_message("news_2", RAW_HTML.replace("Weekly", "Daily")));

    expect(probe.sanitize_calls).toBe(1);
    expect(probe.bodies.slice(shown)).toHaveLength(0);
    expect(placeholder()).not.toBe(null);

    await flush_scheduled();

    const after = probe.bodies.slice(shown);

    expect(probe.sanitize_calls).toBe(2);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((body) => body.email_id === "news_2")).toBe(true);
    expect(after.every((body) => body.html.includes("Daily digest"))).toBe(
      true,
    );
    expect(after.some((body) => body.html.includes("Weekly digest"))).toBe(
      false,
    );
  });

  it("drops the scheduled sanitize when the message changes first", async () => {
    render_message(make_message("news_1"));
    render_message(make_message("news_2", RAW_HTML.replace("Weekly", "Daily")));

    expect(probe.sanitize_calls).toBe(0);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
    expect(probe.bodies.length).toBeGreaterThan(0);
    expect(probe.bodies.every((body) => body.email_id === "news_2")).toBe(true);
    expect(probe.bodies.every((body) => body.html.includes("Daily"))).toBe(
      true,
    );
  });

  it("shows the readable fallback when the deferred sanitize throws", async () => {
    probe.should_throw = true;
    render_message(make_message("news_1"));

    expect(probe.bodies).toHaveLength(0);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
    expect(body_is_mounted()).toBe(true);
    expect(placeholder()).toBe(null);
    expect(probe.bodies.length).toBeGreaterThan(0);
    for (const body of probe.bodies) expect_inert_fallback(body.html);
  });

  it("re-sanitizes a message already on screen in the same render", async () => {
    render_message(make_message("news_1"));
    await flush_scheduled();
    const shown = probe.bodies.length;

    settings.preferences = {
      ...settings.preferences,
      block_remote_images: false,
    };
    render_message(make_message("news_1"));

    expect(probe.sanitize_calls).toBe(2);
    expect(probe.bodies.length).toBeGreaterThan(shown);
    expect(placeholder()).toBe(null);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(2);
    expect_only_sanitized_bodies();
  });

  it("shows the readable fallback when a same-render sanitize throws", async () => {
    render_message(make_message("news_1"));
    await flush_scheduled();
    const shown = probe.bodies.length;

    probe.should_throw = true;
    settings.preferences = {
      ...settings.preferences,
      block_remote_images: false,
    };
    render_message(make_message("news_1"));

    expect(probe.sanitize_calls).toBe(2);
    expect(body_is_mounted()).toBe(true);
    expect(probe.bodies.length).toBeGreaterThan(shown);
    for (const body of probe.bodies.slice(shown)) {
      expect_inert_fallback(body.html);
    }
  });

  it("renders a plain-text body in the same render without sanitizing", async () => {
    const message = {
      ...make_message("plain_1"),
      html_content: undefined,
      body: "Plain hello",
    };

    render_message(message);

    expect(probe.bodies.at(-1)?.html).toContain("Plain hello");
    expect(placeholder()).toBe(null);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(0);
  });

  it("does not sanitize a collapsed message", async () => {
    render_message(make_message("news_1"), false);
    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(0);
    expect(container!.textContent).toContain("Weekly digest");

    render_message(make_message("news_1"), true);

    expect(probe.sanitize_calls).toBe(0);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(1);
    expect_only_sanitized_bodies();
  });

  it("keeps the sanitized body when a message is collapsed and expanded again", async () => {
    render_message(make_message("news_1"));
    await flush_scheduled();

    settings.preferences = {
      ...settings.preferences,
      block_remote_images: false,
    };
    render_message(make_message("news_1"));
    render_message(make_message("news_1"), false);
    render_message(make_message("news_1"), true);

    expect(probe.sanitize_calls).toBe(2);
    expect(placeholder()).toBe(null);
    expect(body_is_mounted()).toBe(true);

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(2);
    expect_only_sanitized_bodies();
  });

  it("reports blocked remote content once the body is sanitized", async () => {
    const html = `<html><body><p>Weekly digest</p><img src="https://images.example.com/a.png" width="40" height="40"></body></html>`;

    render_message(make_message("news_1", html));

    expect(reports).toHaveLength(0);

    await flush_scheduled();

    expect(reports.length).toBeGreaterThan(0);
    expect(reports.at(-1)!.blocked_count).toBeGreaterThan(0);
  });

  it("drops the scheduled sanitize when the message unmounts first", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    render_message(make_message("news_1"));
    act(() => {
      root!.unmount();
    });
    root = null;

    await flush_scheduled();

    expect(probe.sanitize_calls).toBe(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
