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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const { preferences_state, preload_calls } = vi.hoisted(() => ({
  preferences_state: {
    value: { low_network_mode: false } as Record<string, unknown>,
  },
  preload_calls: [] as string[],
}));

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Button: ({ children }: { children?: unknown }) => (
    <button>{children as never}</button>
  ),
  Tooltip: ({ children }: { children?: unknown }) => children as never,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "user@example.com" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: preferences_state.value }),
}));

vi.mock("@/hooks/use_attachment_previews", () => ({
  use_attachment_previews: () => new Map(),
}));

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: () => null,
  resolve_alias_delivery: () => null,
  subscribe_aliases: () => () => {},
}));

vi.mock("@/utils/email_crypto", () => ({
  RATCHET_UNDECRYPTABLE_SENTINEL: "ratchet-sentinel",
  PGP_UNDECRYPTABLE_SENTINEL: "pgp-sentinel",
}));

vi.mock("@/components/email/hooks/use_email_detail", () => ({
  preload_email_detail: async (id: string) => {
    preload_calls.push(id);
  },
  is_preload_busy: () => false,
}));

vi.mock("@/components/folders/folder_password_modal", () => ({
  FolderPasswordModal: () => null,
}));

vi.mock("@/components/email/email_context_menu", () => ({
  EmailContextMenuContent: () => null,
}));

vi.mock("@/components/ui/context_menu", () => ({
  ContextMenu: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ContextMenuTrigger: ({ children }: { children?: unknown }) =>
    children as never,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { request_cache } = await import("@/services/api/request_cache");
const { get_mail_item } = await import("@/services/api/mail");
const { get_preload_in_flight } =
  await import("@/components/email/hooks/preload_cache_store");
const { EmailList, HOVER_PRELOAD_DELAY_MS, HOVER_PRELOAD_REST_MS } =
  await import("./inbox_email_list");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface SentRequest {
  method: string;
  path: string;
}

const sent: SentRequest[] = [];
let release_responses: (() => void) | null = null;

function make_email(id: string, overrides: Partial<InboxEmail> = {}) {
  return {
    id,
    item_type: "received",
    sender_name: `Sender ${id}`,
    sender_email: `${id}@example.com`,
    subject: `Subject ${id}`,
    preview: "preview",
    timestamp: "10:00",
    is_read: false,
    is_starred: false,
    is_selected: false,
    has_attachment: false,
    folders: [],
    tags: [],
    ...overrides,
  } as unknown as InboxEmail;
}

const noop = () => {};
const async_noop = async () => {};
const opened: Promise<unknown>[] = [];

function list_props(emails: InboxEmail[]) {
  return {
    pinned_emails: [] as InboxEmail[],
    primary_emails: emails,
    density: "Default",
    show_profile_pictures: true,
    show_email_preview: true,
    on_toggle_select: noop,
    on_email_click: (id: string) => {
      opened.push(get_mail_item(id));
    },
    current_view: "inbox",
    folders: [],
    tags: [],
    on_reply: noop,
    on_forward: noop,
    on_toggle_read: noop,
    on_toggle_star: noop,
    on_toggle_pin: noop,
    on_snooze: async_noop,
    on_custom_snooze: noop,
    on_unsnooze: async_noop,
    on_archive: noop,
    on_spam: noop,
    on_delete: noop,
    on_folder_toggle: noop,
    on_tag_toggle: noop,
    on_restore: noop,
    on_mark_not_spam: noop,
    on_move_to_inbox: noop,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(emails: InboxEmail[], current_view = "inbox"): void {
  act(() => {
    root!.render(
      <EmailList {...list_props(emails)} current_view={current_view} />,
    );
  });
}

function row(id: string): HTMLElement {
  return container!.querySelector(
    `[data-row-email-id="${id}"] > [role="button"]`,
  ) as HTMLElement;
}

function pointer(
  target: Element,
  type: string,
  init: PointerEventInit = {},
): void {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        ...init,
      }),
    );
  });
}

beforeEach(() => {
  sent.length = 0;
  opened.length = 0;
  preferences_state.value = { low_network_mode: false };
  request_cache.clear();
  get_preload_in_flight().clear();
  vi.mocked(routed_fetch).mockReset();
  vi.mocked(routed_fetch).mockImplementation(async (url, init) => {
    const parsed = new URL(String(url), "https://example.test");

    sent.push({
      method: (init?.method ?? "GET").toUpperCase(),
      path: parsed.pathname.replace(/^\/api/, ""),
    });
    await new Promise<void>((resolve) => {
      release_responses = resolve;
    });

    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify({ id: "a" })),
    } as unknown as Response;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  release_responses?.();
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

function mouse_over(target: Element): void {
  act(() => {
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("EmailList hover preload intent", () => {
  beforeEach(() => {
    preload_calls.length = 0;
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance", "Date"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preloads a row the pointer rests on", () => {
    render([make_email("a"), make_email("b")]);

    mouse_over(row("a"));
    advance(HOVER_PRELOAD_DELAY_MS + 20);

    expect(preload_calls).toEqual(["a"]);
  });

  it("waits while the pointer keeps moving over a row", () => {
    render([make_email("a")]);

    mouse_over(row("a"));
    for (let elapsed = 0; elapsed < 800; elapsed += 40) {
      pointer(row("a"), "pointermove");
      advance(40);
    }

    expect(preload_calls).toEqual([]);

    advance(HOVER_PRELOAD_REST_MS + 20);

    expect(preload_calls).toEqual(["a"]);
  });

  it("preloads nothing during a sweep across rows", () => {
    const emails = ["a", "b", "c", "d", "e"].map((id) => make_email(id));

    render(emails);

    for (const email of emails) {
      mouse_over(row(email.id));
      pointer(row(email.id), "pointermove");
      advance(60);
    }

    expect(preload_calls).toEqual([]);

    advance(HOVER_PRELOAD_DELAY_MS + HOVER_PRELOAD_REST_MS);

    expect(preload_calls).toEqual(["e"]);
  });
});
