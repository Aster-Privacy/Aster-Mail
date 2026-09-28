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
import type { LocalEmailData } from "@/components/email/email_viewer_types";
import type { EditDraftData } from "@/components/compose/compose_manager";
import type { PendingSend } from "@/hooks/use_undo_send";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  useHref,
  useLocation,
  useNavigate,
} from "react-router-dom";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const list_mail_items = vi.fn();
let active_account_index: number | null = 2;

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
}));

vi.mock("@/lib/account_index_url", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/account_index_url")>()),
  get_active_account_index: () => active_account_index,
}));

const {
  PENDING_REQUEST_TTL_MS,
  hard_navigation_target,
  open_message_in_view_mode,
  open_pending_send_preview,
  can_preview_pending_send,
  register_compose_host,
  register_message_view_host,
  register_toast_navigator,
  reset_toast_action_router,
  restore_undone_send_draft,
} = await import("./toast_action_router");
const { show_email_sent_toast } = await import("./email_sent_toast");
const { hide_action_toast, subscribe_action_toast } = await import(
  "./action_toast"
);
const { draft_from_undone_send, undone_send_has_content } = await import(
  "./undone_send_draft"
);

const ACCOUNT_BASENAME = "/u/2";
const ACCOUNT_ROOT_PATTERN = /^\/u\/2\/?$/;
const NO_LIST_ROUTES = ["/contacts", "/subscriptions"];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let current_href = "";
let current_state: unknown = null;
let shown_messages: string[] = [];
let shown_previews: LocalEmailData[] = [];
let latest_view_action: (() => void) | undefined;
let unsubscribe_toast: () => void = () => {};

interface HarnessProps {
  is_mobile_app: boolean;
  has_view_host: boolean;
  use_popup_mode: boolean;
}

function Harness({
  is_mobile_app,
  has_view_host,
  use_popup_mode,
}: HarnessProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const href = useHref(location);
  const can_show =
    use_popup_mode || !NO_LIST_ROUTES.includes(location.pathname);

  current_href = href;
  current_state = location.state;

  useEffect(() => {
    return register_toast_navigator({
      navigate: (path, options) => {
        void navigate(path, options);
      },
      is_mobile_app,
      prefers_full_page: is_mobile_app,
    });
  }, [navigate, is_mobile_app]);

  useEffect(() => {
    if (!has_view_host) return;

    return register_message_view_host({
      can_show_message: () => can_show,
      can_show_preview: () => can_show,
      show_message: (email_id) => {
        shown_messages.push(email_id);
      },
      show_preview: (data) => {
        shown_previews.push(data);
      },
      go_to_list: (route) => {
        void navigate(route);
      },
    });
  }, [has_view_host, can_show, navigate]);

  return null;
}

function mount(route: string, props: Partial<HarnessProps> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <MemoryRouter
        basename={ACCOUNT_BASENAME}
        initialEntries={[`${ACCOUNT_BASENAME}${route}`]}
      >
        <Harness
          has_view_host={props.has_view_host ?? true}
          is_mobile_app={props.is_mobile_app ?? false}
          use_popup_mode={props.use_popup_mode ?? false}
        />
      </MemoryRouter>,
    );
  });
}

function register_open_view_host() {
  register_message_view_host({
    can_show_message: () => true,
    can_show_preview: () => true,
    show_message: (email_id) => {
      shown_messages.push(email_id);
    },
    show_preview: (data) => {
      shown_previews.push(data);
    },
    go_to_list: () => {},
  });
}

function sample_preview(): LocalEmailData {
  return { subject: "s", body: "b", to: ["r"] };
}

function sample_draft(): EditDraftData {
  return {
    id: "",
    version: 0,
    draft_type: "new",
    to_recipients: ["r"],
    cc_recipients: [],
    bcc_recipients: [],
    subject: "s",
    message: "b",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function shown_view_action(): () => void {
  if (!latest_view_action) throw new Error("view message action missing");

  return latest_view_action;
}

async function settle() {
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  reset_toast_action_router();
  list_mail_items.mockReset();
  active_account_index = 2;
  current_href = "";
  current_state = null;
  shown_messages = [];
  shown_previews = [];
  latest_view_action = undefined;
  unsubscribe_toast = subscribe_action_toast((toast) => {
    latest_view_action = toast?.on_view_message;
  });
});

afterEach(() => {
  unsubscribe_toast();
  act(() => hide_action_toast());
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  reset_toast_action_router();
  vi.useRealTimers();
});

describe("open_message_in_view_mode", () => {
  it("opens the message in place when the current route has a viewer", () => {
    mount("/starred");

    act(() => open_message_in_view_mode("msg_1"));

    expect(shown_messages).toEqual(["msg_1"]);
    expect(current_href).toBe("/u/2/starred");
  });

  it("opens the message over contacts when the popup viewer is in use", () => {
    mount("/contacts", { use_popup_mode: true });

    act(() => open_message_in_view_mode("msg_1"));

    expect(shown_messages).toEqual(["msg_1"]);
    expect(current_href).toBe("/u/2/contacts");
  });

  it("leaves contacts for the sent list under the account prefix and then opens the message", () => {
    mount("/contacts");

    act(() => open_message_in_view_mode("msg_1"));

    expect(current_href).toBe("/u/2/sent");
    expect(shown_messages).toEqual(["msg_1"]);
  });

  it("leaves subscriptions for the inbox when a received message is requested", () => {
    mount("/subscriptions");

    act(() => open_message_in_view_mode("msg_9", "inbox"));

    expect(current_href).toMatch(ACCOUNT_ROOT_PATTERN);
    expect(shown_messages).toEqual(["msg_9"]);
  });

  it("goes to the sent list when no page hosts a viewer and opens the message once one registers", () => {
    mount("/email/other", { has_view_host: false });

    act(() => open_message_in_view_mode("msg_1"));

    expect(current_href).toBe("/u/2/sent");
    expect(shown_messages).toEqual([]);

    act(() => register_open_view_host());

    expect(shown_messages).toEqual(["msg_1"]);
  });

  it("opens the full page message under the account prefix in the mobile app", () => {
    mount("/contacts", { is_mobile_app: true, has_view_host: false });

    act(() => open_message_in_view_mode("msg_1"));

    expect(current_href).toBe("/u/2/email/msg_1");
    expect(current_state).toEqual({ from_view: "sent" });
  });

  it("drops a waiting request that outlived its window", () => {
    mount("/email/other", { has_view_host: false });

    const now_spy = vi.spyOn(Date, "now");

    now_spy.mockReturnValue(1000);
    act(() => open_message_in_view_mode("msg_1"));
    now_spy.mockReturnValue(1000 + PENDING_REQUEST_TTL_MS + 1);
    act(() => register_open_view_host());
    now_spy.mockRestore();

    expect(shown_messages).toEqual([]);
  });
});

describe("hard_navigation_target", () => {
  it("keeps the active account prefix", () => {
    active_account_index = 3;

    expect(hard_navigation_target("/sent")).toBe("/u/3/sent");
    expect(hard_navigation_target("/email/msg_1")).toBe("/u/3/email/msg_1");
  });

  it("returns the bare path when account routing is off", () => {
    active_account_index = null;

    expect(hard_navigation_target("/sent")).toBe("/sent");
  });
});

describe("sent toast view message action", () => {
  it("opens the sent message by id from the contacts route", async () => {
    mount("/contacts");
    act(() => show_email_sent_toast("sent", "msg_7"));

    const action = shown_view_action();

    await act(async () => {
      action();
      await settle();
    });

    expect(list_mail_items).not.toHaveBeenCalled();
    expect(current_href).toBe("/u/2/sent");
    expect(shown_messages).toEqual(["msg_7"]);
  });

  it("resolves the newest sent message when the id is unknown", async () => {
    list_mail_items.mockResolvedValue({ data: { items: [{ id: "msg_8" }] } });
    mount("/settings/appearance", { use_popup_mode: true });
    act(() => show_email_sent_toast("sent"));

    const action = shown_view_action();

    await act(async () => {
      action();
      await settle();
    });

    expect(shown_messages).toEqual(["msg_8"]);
  });

  it("falls back to the sent list when no message can be resolved", async () => {
    list_mail_items.mockRejectedValue(new Error("offline"));
    mount("/contacts");
    act(() => show_email_sent_toast("sent"));

    const action = shown_view_action();

    await act(async () => {
      action();
      await settle();
    });

    expect(current_href).toBe("/u/2/sent");
    expect(shown_messages).toEqual([]);
  });
});

describe("open_pending_send_preview", () => {
  it("shows the preview in place when the route has a viewer", () => {
    mount("/archive");

    act(() => {
      open_pending_send_preview(sample_preview());
    });

    expect(shown_previews).toHaveLength(1);
    expect(current_href).toBe("/u/2/archive");
  });

  it("moves from contacts to the sent list and then shows the preview", () => {
    mount("/contacts");

    act(() => {
      open_pending_send_preview(sample_preview());
    });

    expect(current_href).toBe("/u/2/sent");
    expect(shown_previews).toHaveLength(1);
  });

  it("is not offered in the mobile app", () => {
    mount("/contacts", { is_mobile_app: true, has_view_host: false });

    expect(can_preview_pending_send()).toBe(false);
    expect(open_pending_send_preview(sample_preview())).toBe(false);
    expect(current_href).toBe("/u/2/contacts");
  });
});

describe("restore_undone_send_draft", () => {
  it("opens the draft in the compose host of the current page", () => {
    const open_draft = vi.fn();

    mount("/email/other", { has_view_host: false });
    register_compose_host({ restores_undone_sends: false, open_draft });

    act(() => restore_undone_send_draft(sample_draft()));

    expect(open_draft).toHaveBeenCalledTimes(1);
    expect(open_draft.mock.calls[0][0].to_recipients).toEqual(["r"]);
    expect(current_href).toBe("/u/2/email/other");
  });

  it("leaves the draft to a page that restores undone sends itself", () => {
    const open_draft = vi.fn();

    mount("/contacts");
    register_compose_host({ restores_undone_sends: true, open_draft });

    act(() => restore_undone_send_draft(sample_draft()));

    expect(open_draft).not.toHaveBeenCalled();
  });

  it("goes to the mailbox and opens the draft once a compose host registers", () => {
    const open_draft = vi.fn();

    mount("/crypto-invoice/1", { has_view_host: false });

    act(() => restore_undone_send_draft(sample_draft()));

    expect(current_href).toMatch(ACCOUNT_ROOT_PATTERN);

    register_compose_host({ restores_undone_sends: true, open_draft });

    expect(open_draft).toHaveBeenCalledTimes(1);
  });
});

describe("draft_from_undone_send", () => {
  const pending: PendingSend = {
    id: "queue_1",
    to: ["a"],
    cc: ["b"],
    subject: "pending subject",
    body: "pending body",
    scheduled_time: 0,
    total_seconds: 10,
    thread_token: "thread_1",
  };

  it("prefers the stored payload over the pending summary", () => {
    const draft = draft_from_undone_send(pending, {
      to: ["c"],
      subject: "payload subject",
      body: "payload body",
      draft_type: "reply",
      reply_to_id: "msg_1",
    });

    expect(draft.to_recipients).toEqual(["c"]);
    expect(draft.subject).toBe("payload subject");
    expect(draft.message).toBe("payload body");
    expect(draft.draft_type).toBe("reply");
    expect(draft.reply_to_id).toBe("msg_1");
    expect(draft.thread_token).toBe("thread_1");
  });

  it("falls back to the pending summary without a payload", () => {
    const draft = draft_from_undone_send(pending);

    expect(draft.to_recipients).toEqual(["a"]);
    expect(draft.cc_recipients).toEqual(["b"]);
    expect(draft.bcc_recipients).toEqual([]);
    expect(draft.draft_type).toBe("new");
  });

  it("reports a restored send without a payload as having no content", () => {
    expect(undone_send_has_content({ ...pending, is_restored: true })).toBe(
      false,
    );
    expect(undone_send_has_content(pending)).toBe(true);
  });
});
