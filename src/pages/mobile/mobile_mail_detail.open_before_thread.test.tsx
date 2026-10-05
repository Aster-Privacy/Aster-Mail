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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROW_HEIGHT = 50;
const LIST_TOP = 60;
const THREAD_SIZE = 10;

const h = vi.hoisted(() => ({
  detail: null as Record<string, unknown> | null,
  read_updates: [] as string[],
  mark_as_read_delay: "immediate" as string,
}));

function message(index: number, is_read = true): DecryptedThreadMessage {
  return {
    id: `m${index}`,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.org",
    subject: "Weekly update",
    body: `Message number ${index}`,
    timestamp: new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString(),
    is_read,
    is_starred: false,
    is_deleted: false,
    is_external: false,
  } as DecryptedThreadMessage;
}

vi.mock("framer-motion", async () => {
  const react = await import("react");

  return {
    motion: {
      div: ({
        children,
        className,
      }: {
        children?: React.ReactNode;
        className?: string;
      }) => react.createElement("div", { className }, children),
    },
  };
});
vi.mock("./mobile_thread_message", async () => {
  const react = await import("react");

  return {
    MobileThreadMessage: ({
      message,
      is_expanded,
      on_toggle,
    }: {
      message: DecryptedThreadMessage;
      is_expanded: boolean;
      on_toggle: () => void;
    }) =>
      react.createElement("button", {
        "data-row": message.id,
        "data-expanded": String(is_expanded),
        onClick: on_toggle,
        type: "button",
      }),
  };
});
vi.mock("./mobile_detail_banners", () => ({
  MobileUnsubscribeBanner: () => null,
  MobileExternalContentBanner: () => null,
}));
vi.mock("./mobile_detail_toolbar", () => ({ MobileToolbar: () => null }));
vi.mock("./mobile_detail_sheets", () => ({
  MobileActionMenuSheet: () => null,
  MobileViewSourceSheet: () => null,
  MobileSnoozeSheet: () => null,
  MobileToolbarCustomizerSheet: () => null,
  MobileMessageDetailsSheet: () => null,
}));
vi.mock("@/components/mobile/mobile_header", () => ({
  MobileHeader: () => null,
}));
vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
}));
vi.mock("@/components/email/hooks/use_email_detail", () => ({
  use_email_detail: () => h.detail,
  preload_email_detail: vi.fn(),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      force_dark_mode_emails: false,
      conversation_order: "asc",
      mark_as_read_delay: h.mark_as_read_delay,
      mobile_toolbar_actions: [],
    },
    update_preference: vi.fn(),
  }),
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/auth_context", () => ({ use_auth_safe: () => null }));
vi.mock("@/components/email/use_spam_confirm", () => ({
  use_spam_confirm: () => ({
    request_spam: vi.fn(),
    spam_confirm_dialog: null,
  }),
}));
vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({ sender_options: [] }),
}));
vi.mock("@/hooks/use_email_actions", () => ({ use_email_actions: () => ({}) }));
vi.mock("@/hooks/use_email_list", () => ({
  remove_email_from_view_cache: vi.fn(),
}));
vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({ format_email_detail: () => "" }),
}));
vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));
vi.mock("@/hooks/use_snooze", () => ({ use_snooze: () => ({}) }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));
vi.mock("@/components/compose/compose_shared", () => ({
  get_aster_footer: () => "",
}));
vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: async (id: string) => {
    h.read_updates.push(id);

    return { success: true };
  },
}));
vi.mock("@/hooks/mail_events", () => ({ emit_mail_item_updated: vi.fn() }));
vi.mock("@/services/read_intent", () => ({ get_read_intent: () => null }));
vi.mock("@/services/user_opened_mail", () => ({
  current_opened_mail_scope: () => 0,
}));
vi.mock("@/native/haptic_feedback", () => ({ haptic_impact: vi.fn() }));
vi.mock("@/services/api/blocked_senders", () => ({ block_sender: vi.fn() }));
vi.mock("@/services/lockdown_store", () => ({
  is_lockdown_enabled: () => false,
  LOCKDOWN_CHANGED_EVENT: "lockdown-changed",
}));
vi.mock("@/lib/aster_footer_strip", () => ({
  strip_aster_footers_html: (html: string) => html,
}));
vi.mock("@/utils/copy_text", () => ({ copy_text_or_throw: vi.fn() }));
vi.mock("@/components/email/build_reply_recipient", () => ({
  build_reply_recipient_for_message: vi.fn(),
}));
vi.mock("@/components/email/build_reply_from_address", () => ({
  resolve_own_recipient_address: vi.fn(),
}));
vi.mock("@/utils/delivered_to", () => ({
  resolve_received_on_address: vi.fn(),
}));
vi.mock("@/lib/reply_subject", () => ({ build_reply_subject: vi.fn() }));
vi.mock("@/lib/reply_defaults", () => ({
  reply_includes_quoted_by_default: () => true,
  resolve_reply_prefix: () => "Re:",
}));
vi.mock("@/utils/date_format", () => ({ app_locale: () => "en" }));
vi.mock("@/lib/reply_references", () => ({
  resolve_reply_references: vi.fn(),
}));
vi.mock("@/lib/html_sanitizer_compose", () => ({
  sanitize_outgoing_html: (html: string) => html,
}));
vi.mock("@/lib/forward_css_inliner", () => ({
  inline_email_css: (html: string) => html,
}));

const { default: MobileMailDetail } = await import("./mobile_mail_detail");

let root: Root | null = null;
let host: HTMLDivElement;
let original_rect: typeof HTMLElement.prototype.getBoundingClientRect;

function rect(top: number): DOMRect {
  return {
    top,
    bottom: top + ROW_HEIGHT,
    left: 0,
    right: 0,
    width: 0,
    height: ROW_HEIGHT,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function scroller(): HTMLElement {
  return host.querySelector(".overflow-y-auto") as HTMLElement;
}

function thread_rows(): Element[] {
  const first = host.querySelector("[data-row]");
  const list = first?.parentElement?.parentElement;

  return list ? Array.from(list.children) : [];
}

function top_of(id: string): number {
  return host
    .querySelector(`[data-row="${id}"]`)!
    .parentElement!.getBoundingClientRect().top;
}

function expanded(id: string): boolean {
  return (
    host.querySelector(`[data-row="${id}"]`)?.getAttribute("data-expanded") ===
    "true"
  );
}

function show(
  messages: DecryptedThreadMessage[],
  opened: string,
  pending = 0,
  email_id = opened,
) {
  const opened_message = messages.find((m) => m.id === opened)!;

  h.detail = {
    email_id,
    email: {
      id: opened,
      subject: "Weekly update",
      sender: "Sender",
      sender_email: "sender@example.org",
      body: opened_message.body,
      timestamp: opened_message.timestamp,
      is_read: opened_message.is_read,
      is_starred: false,
      to: [],
      cc: [],
      bcc: [],
    },
    mail_item: { id: opened, item_type: "received" },
    thread_messages: messages,
    pending_thread_count: pending,
    current_user_email: "me@astermail.org",
    is_loading: false,
    error: null,
    can_go_newer: false,
    can_go_older: false,
    email_list: [],
    current_email_index: 0,
    preferences: { conversation_grouping: true },
    t: (key: string) => key,
  };
  act(() => root!.render(createElement(MobileMailDetail)));
}

async function flush(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 10)),
      );
    });
  }
}

describe("mobile detail when the rest of the thread arrives", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    h.read_updates = [];
    h.mark_as_read_delay = "immediate";
    host = document.createElement("div");
    document.body.appendChild(host);
    original_rect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const container = scroller();

      if (this === container) return rect(0);
      const index = thread_rows().indexOf(this);
      const top = LIST_TOP - (container?.scrollTop ?? 0);

      return rect(index === -1 ? top : top + index * ROW_HEIGHT);
    };
    root = createRoot(host);
  });

  afterEach(() => {
    const mounted = root;

    root = null;
    if (mounted) act(() => mounted.unmount());
    HTMLElement.prototype.getBoundingClientRect = original_rect;
    host.remove();
  });

  it("shows the opened message with placeholder rows while the thread loads", async () => {
    const opened = message(THREAD_SIZE - 1);

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();

    expect(host.querySelectorAll("[data-row]")).toHaveLength(1);
    expect(expanded(opened.id)).toBe(true);
    expect(
      host.querySelectorAll('div[aria-hidden="true"].overflow-hidden'),
    ).toHaveLength(3);
    expect(host.textContent).toContain(`${THREAD_SIZE} mail.messages_label`);
  });

  it("keeps the opened message where it was when earlier messages appear above it", async () => {
    const thread = Array.from({ length: THREAD_SIZE }, (_, i) => message(i));
    const opened = thread[THREAD_SIZE - 1];

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();
    const before = top_of(opened.id);

    show(thread, opened.id);
    await flush();

    expect(host.querySelectorAll("[data-row]")).toHaveLength(THREAD_SIZE);
    expect(
      host.querySelectorAll('div[aria-hidden="true"].overflow-hidden'),
    ).toHaveLength(0);
    expect(top_of(opened.id)).toBe(before);
  });

  it("keeps the expanded state of the opened message across the merge", async () => {
    const thread = Array.from({ length: THREAD_SIZE }, (_, i) => message(i));
    const opened = thread[4];

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();
    expect(expanded(opened.id)).toBe(true);

    show(thread, opened.id);
    await flush();

    expect(expanded(opened.id)).toBe(true);
  });

  it("keeps a message the reader collapsed while the thread loaded collapsed", async () => {
    const thread = Array.from({ length: THREAD_SIZE }, (_, i) => message(i));
    const opened = thread[THREAD_SIZE - 1];

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();
    act(() => {
      (host.querySelector(`[data-row="${opened.id}"]`) as HTMLElement).click();
    });
    expect(expanded(opened.id)).toBe(false);

    show(thread, opened.id);
    await flush();

    expect(expanded(opened.id)).toBe(false);
  });

  it("marks the opened unread message read once the thread shows it is the latest", async () => {
    const thread = Array.from({ length: THREAD_SIZE }, (_, i) =>
      message(i, i < THREAD_SIZE - 1),
    );
    const opened = thread[THREAD_SIZE - 1];

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();
    expect(h.read_updates).toEqual([]);

    show(thread, opened.id);
    await flush();

    expect(h.read_updates).toEqual([opened.id]);
  });

  it("still expands and marks read an earlier unread message that arrives with the thread", async () => {
    const thread = Array.from({ length: THREAD_SIZE }, (_, i) =>
      message(i, i !== 6 && i !== THREAD_SIZE - 1),
    );
    const opened = thread[THREAD_SIZE - 1];

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();

    show(thread, opened.id);
    await flush();

    expect(expanded("m6")).toBe(true);
    expect(expanded("m5")).toBe(false);
    expect([...h.read_updates].sort()).toEqual([opened.id, "m6"].sort());
  });
  it("scrolls to the first unread message of the next email opened while a thread was loading", async () => {
    const scrolled: string[] = [];
    const original_scroll = HTMLElement.prototype.scrollIntoView;

    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      const row = this.querySelector("[data-row]");

      if (row) scrolled.push(row.getAttribute("data-row")!);
    };

    try {
      const opened = message(THREAD_SIZE - 1);

      show([opened], opened.id, THREAD_SIZE - 1);
      await flush();
      scrolled.length = 0;

      const next = Array.from({ length: 8 }, (_, i) => ({
        ...message(20 + i, i < 1),
        id: `n${i}`,
      }));

      show([opened], opened.id, THREAD_SIZE - 1, "n7");
      show(next, "n7");
      await flush();

      expect(scrolled).toEqual(["n1"]);
      expect(expanded("n1")).toBe(false);
      expect(expanded("n3")).toBe(true);
      expect(expanded("n7")).toBe(true);
    } finally {
      HTMLElement.prototype.scrollIntoView = original_scroll;
    }
  });
  it("keeps the opened message where it was when the thread request fails", async () => {
    const opened = message(THREAD_SIZE - 1);

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();
    act(() => {
      scroller().scrollTop = 40;
    });
    const before = top_of(opened.id);

    show([opened], opened.id);
    await flush();

    expect(
      host.querySelectorAll('div[aria-hidden="true"].overflow-hidden'),
    ).toHaveLength(0);
    expect(top_of(opened.id)).toBe(before);
  });

  it("does not mark an older opened message that has more than five newer unread messages", async () => {
    const thread = Array.from({ length: THREAD_SIZE }, (_, i) =>
      message(i, i < 3),
    );
    const opened = thread[3];

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();
    expect(expanded(opened.id)).toBe(true);
    expect(h.read_updates).toEqual([]);

    show(thread, opened.id);
    await flush();

    expect(expanded(opened.id)).toBe(true);
    expect([...h.read_updates].sort()).toEqual(["m5", "m6", "m7", "m8", "m9"]);
  });

  it("marks the opened message read when the thread request fails", async () => {
    const opened = message(THREAD_SIZE - 1, false);

    show([opened], opened.id, THREAD_SIZE - 1);
    await flush();
    expect(h.read_updates).toEqual([]);

    show([opened], opened.id);
    await flush();

    expect(h.read_updates).toEqual([opened.id]);
  });

  describe("while it holds the opened message in place after the merge", () => {
    type Observer = { callback: () => void; connected: boolean };
    let observers: Observer[] = [];
    let original_observer: typeof ResizeObserver;

    function resize_frames() {
      act(() => {
        observers.forEach((o) => {
          if (o.connected) o.callback();
        });
      });
    }

    async function merge_thread() {
      const thread = Array.from({ length: THREAD_SIZE }, (_, i) => message(i));
      const opened = thread[THREAD_SIZE - 1];

      show([opened], opened.id, THREAD_SIZE - 1);
      await flush();
      show(thread, opened.id);
      await flush();
    }

    beforeEach(() => {
      observers = [];
      original_observer = globalThis.ResizeObserver;
      globalThis.ResizeObserver = class {
        entry: Observer;

        constructor(callback: () => void) {
          this.entry = { callback, connected: true };
          observers.push(this.entry);
        }
        observe() {}
        unobserve() {}
        disconnect() {
          this.entry.connected = false;
        }
      } as unknown as typeof ResizeObserver;
    });

    afterEach(() => {
      globalThis.ResizeObserver = original_observer;
    });

    it("does not pull back a programmatic scroll", async () => {
      await merge_thread();
      const anchored = scroller().scrollTop;

      expect(anchored).toBeGreaterThan(0);
      expect(observers.some((o) => o.connected)).toBe(true);

      act(() => {
        scroller().scrollTop = anchored - 200;
      });
      resize_frames();

      expect(scroller().scrollTop).toBe(anchored - 200);
      expect(observers.some((o) => o.connected)).toBe(false);
    });

    it("lets go of the opened message after a second", async () => {
      await merge_thread();
      expect(observers.some((o) => o.connected)).toBe(true);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });

      expect(observers.some((o) => o.connected)).toBe(false);
    });
  });
});
