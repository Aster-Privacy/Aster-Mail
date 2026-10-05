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

const { preferences_state } = vi.hoisted(() => ({
  preferences_state: {
    value: { low_network_mode: false } as Record<string, unknown>,
  },
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
  preload_email_detail: async () => {},
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
const { EmailList } = await import("./inbox_email_list");

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

function item_requests(id: string): SentRequest[] {
  return sent.filter((r) => r.path === `/mail/v1/messages/${id}`);
}

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

function click(target: Element, init: MouseEventInit = {}): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, ...init }),
    );
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
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

describe("EmailList press prefetch", () => {
  it("starts the item fetch on a primary mouse press", async () => {
    render([make_email("a"), make_email("b")]);

    pointer(row("a"), "pointerdown");
    await flush();

    expect(item_requests("a")).toHaveLength(1);
    expect(item_requests("b")).toHaveLength(0);
  });

  it("lets the open reuse the pressed fetch so press plus open is one request", async () => {
    render([make_email("a")]);

    pointer(row("a"), "pointerdown");
    await flush();

    expect(item_requests("a")).toHaveLength(1);

    pointer(row("a"), "pointerup");
    click(row("a"));
    await flush();

    expect(opened).toHaveLength(1);
    expect(item_requests("a")).toHaveLength(1);
  });

  it("lets an open after the pressed fetch landed reuse the cached response", async () => {
    render([make_email("a")]);

    pointer(row("a"), "pointerdown");
    await flush();
    release_responses?.();
    await flush();
    await flush();
    click(row("a"));
    await flush();

    expect(opened).toHaveLength(1);
    expect(item_requests("a")).toHaveLength(1);
  });

  it("does not serve a pressed response after the account caches are cleared", async () => {
    render([make_email("a")]);

    pointer(row("a"), "pointerdown");
    await flush();
    request_cache.clear();
    click(row("a"));
    await flush();

    expect(item_requests("a")).toHaveLength(2);
  });

  it("does not serve a pressed response after the mailbox changes", async () => {
    render([make_email("a")]);

    pointer(row("a"), "pointerdown");
    await flush();
    release_responses?.();
    await flush();
    await flush();
    request_cache.invalidate_for_mutation("/mail/v1/messages/bulk");
    click(row("a"));
    await flush();

    expect(item_requests("a")).toHaveLength(2);
  });

  it("only reads the item on press and never writes read state", async () => {
    render([make_email("a")]);

    pointer(row("a"), "pointerdown");
    await flush();

    expect(sent).toEqual([{ method: "GET", path: "/mail/v1/messages/a" }]);
  });

  it("ignores right-click and modifier presses", async () => {
    render([make_email("a")]);

    pointer(row("a"), "pointerdown", { button: 2 });
    pointer(row("a"), "pointerdown", { button: 1 });
    pointer(row("a"), "pointerdown", { ctrlKey: true });
    pointer(row("a"), "pointerdown", { metaKey: true });
    pointer(row("a"), "pointerdown", { shiftKey: true });
    act(() => {
      row("a").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    await flush();

    expect(sent).toHaveLength(0);
  });

  it("ignores presses on the select control inside the row", async () => {
    render([make_email("a")]);

    const select_slot = row("a").querySelector('[role="button"]')!;

    pointer(select_slot, "pointerdown");
    await flush();

    expect(sent).toHaveLength(0);
  });

  it("does not fetch for a touch that turns into a scroll", async () => {
    render([make_email("a")]);

    pointer(row("a"), "pointerdown", {
      pointerType: "touch",
      clientX: 50,
      clientY: 50,
    });
    pointer(row("a"), "pointermove", {
      pointerType: "touch",
      clientX: 50,
      clientY: 90,
    });
    pointer(row("a"), "pointerup", {
      pointerType: "touch",
      clientX: 50,
      clientY: 90,
    });
    pointer(row("a"), "pointerdown", { pointerType: "touch" });
    pointer(row("a"), "pointercancel", { pointerType: "touch" });
    await flush();

    expect(sent).toHaveLength(0);
  });

  it("fetches a touch only once it lifts as a tap", async () => {
    render([make_email("a")]);

    pointer(row("a"), "pointerdown", {
      pointerType: "touch",
      clientX: 50,
      clientY: 50,
    });
    await flush();

    expect(sent).toHaveLength(0);

    pointer(row("a"), "pointerup", {
      pointerType: "touch",
      clientX: 53,
      clientY: 52,
    });
    await flush();

    expect(item_requests("a")).toHaveLength(1);

    click(row("a"));
    await flush();

    expect(item_requests("a")).toHaveLength(1);
  });

  it("does not fetch for a touch long-press", async () => {
    render([make_email("a")]);

    const now = vi.spyOn(performance, "now");

    now.mockReturnValue(1_000);
    pointer(row("a"), "pointerdown", { pointerType: "touch" });
    now.mockReturnValue(1_700);
    pointer(row("a"), "pointerup", { pointerType: "touch" });
    now.mockRestore();
    await flush();

    expect(sent).toHaveLength(0);
  });

  it("leaves the request to a hover preload already in flight", async () => {
    render([make_email("a")]);

    get_preload_in_flight().set("a", new Promise<void>(() => {}));
    pointer(row("a"), "pointerdown");
    await flush();

    expect(sent).toHaveLength(0);
  });

  it("does nothing in drafts, scheduled or low network mode", async () => {
    render([make_email("a")], "drafts");
    pointer(row("a"), "pointerdown");
    render([make_email("a")], "scheduled");
    pointer(row("a"), "pointerdown");
    preferences_state.value = { low_network_mode: true };
    render([make_email("a")], "inbox");
    pointer(row("a"), "pointerdown");
    await flush();

    expect(sent).toHaveLength(0);
  });
});
