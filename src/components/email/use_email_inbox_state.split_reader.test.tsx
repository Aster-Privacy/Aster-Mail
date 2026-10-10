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
import type { EmailInboxProps } from "@/components/email/inbox/inbox_types";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useCallback, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

const { preferences_mock, view_state, selection_stub, noop } = vi.hoisted(
  () => {
    const noop = () => {};

    return {
      preferences_mock: { auto_advance: "Go to next message" },
      view_state: { current: null as unknown },
      selection_stub: {
        handle_toggle_select: noop,
        handle_toggle_select_all: noop,
        select_all_mode: false,
        excluded_ids: [] as string[],
        get_excluded_message_ids: () => [] as string[],
      },
      noop,
    };
  },
);

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: preferences_mock }),
}));

vi.mock("@/components/email/use_inbox_view_state", () => ({
  use_inbox_view_state: () => view_state.current,
}));

vi.mock("@/services/category_index", () => ({
  is_fully_built: () => false,
  is_index_reconciled: () => false,
  is_index_settled: () => true,
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: () => null,
}));

vi.mock("@/components/email/inbox/use_category_drop", () => ({
  use_category_drop: () => noop,
}));

vi.mock("@/components/email/inbox/use_inbox_selection", () => ({
  use_inbox_selection: () => selection_stub,
}));

vi.mock("@/components/email/inbox/use_inbox_selection_menu", () => ({
  use_inbox_selection_menu: () => null,
}));

vi.mock("@/components/email/inbox/use_inbox_bulk_actions", () => ({
  use_inbox_bulk_actions: () => ({}),
}));

vi.mock("@/components/email/inbox/use_split_email_view", () => ({
  use_split_email_view: () => ({}),
}));

vi.mock("@/components/email/inbox/use_split_pane", () => ({
  use_split_pane: () => ({}),
}));

vi.mock("@/components/email/inbox/use_inbox_list_scroll", () => ({
  use_inbox_list_scroll: () => ({}),
}));

import { use_email_inbox_state } from "@/components/email/use_email_inbox_state";
import { use_auto_advance } from "@/components/email/hooks/use_auto_advance";
import { use_keyboard_shortcuts } from "@/hooks/use_keyboard_shortcuts";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ConfirmKind = "archive" | "delete" | "spam";

const make_email = (id: string, sender_email: string): InboxEmail =>
  ({
    id,
    sender_email,
    item_type: "received",
    is_read: true,
    is_pinned: false,
    is_selected: false,
    is_archived: false,
    is_spam: false,
    is_trashed: false,
  }) as InboxEmail;

const emails_at_start = [
  make_email("a", "alice@example.com"),
  make_email("b", "news@example.com"),
  make_email("c", "news@example.com"),
  make_email("d", "dan@example.com"),
];

const confirm_before: Record<ConfirmKind, boolean> = {
  archive: false,
  delete: false,
  spam: false,
};
const performed: string[] = [];
const list_controls = {
  confirm: noop,
  cancel: noop,
  drop: (_id: string) => {},
  restore: (_id: string) => {},
};

const STABLE_VIEW_STATE = {
  t: (key: string) => key,
  user: null,
  preferences: { conversation_grouping: true, custom_categories: [] },
  update_preference: noop,
  mail_stats: { inbox: 4, unread: 0 },
  folders_state: { folders: [] },
  tags_state: { tags: [] },
  current_page: 0,
  set_current_page: noop,
  page_size: 50,
  categories: { enabled: false, active_category: "primary", counts: {} },
  is_drafts_view: false,
  is_scheduled_view: false,
  is_snoozed_view: false,
  spam_retention_days: null,
  trash_retention_days: null,
  family_policy: null,
  is_folder_view: false,
  folder_view_token: null,
  folders_loading_for_view: false,
  folder_not_found: false,
  is_tag_view: false,
  tag_view_token: null,
  tag_not_found: false,
  locked_folder: null,
  page_category_ref: { current: "primary" },
  fetch_page: () => Promise.resolve(),
  is_page_cached: () => true,
  update_email: noop,
  refresh_active_list: noop,
  refresh_current_view: noop,
  update_draft: noop,
  scheduled_state: { emails: [] },
  update_scheduled: noop,
  manual_refresh_active: false,
  handle_snooze: () => Promise.resolve(true),
  handle_unsnooze: () => Promise.resolve(),
  handle_category_change: noop,
  handle_edit_thread_draft: noop,
  folders_lookup: new Map(),
  tags_lookup: new Map(),
};

const page = {
  split_email_id: null as string | null,
  visible_ids: [] as string[],
  open: (_id: string | null) => {},
};
let inbox: ReturnType<typeof use_email_inbox_state> | null = null;

function Inbox(props: EmailInboxProps) {
  const [emails, set_emails] = useState<InboxEmail[]>(emails_at_start);
  const [confirming, set_confirming] = useState<{
    kind: ConfirmKind;
    email: InboxEmail;
  } | null>(null);
  const emails_ref = useRef(emails);

  emails_ref.current = emails;

  const remove = useCallback((ids: string[]) => {
    set_emails((prev) => prev.filter((e) => !ids.includes(e.id)));
  }, []);

  const perform = useCallback(
    (kind: string, email: InboxEmail) => {
      performed.push(`${kind}:${email.id}`);
      remove(
        kind === "spam"
          ? emails_ref.current
              .filter((e) => e.sender_email === email.sender_email)
              .map((e) => e.id)
          : [email.id],
      );
    },
    [remove],
  );

  const request = useCallback(
    (kind: ConfirmKind, email: InboxEmail) => {
      if (confirm_before[kind]) {
        set_confirming({ kind, email });

        return;
      }
      perform(kind, email);
    },
    [perform],
  );

  list_controls.confirm = () => {
    if (confirming) perform(confirming.kind, confirming.email);
    set_confirming(null);
  };
  list_controls.cancel = () => set_confirming(null);
  list_controls.drop = (id: string) => remove([id]);
  list_controls.restore = (id: string) =>
    set_emails((prev) =>
      emails_at_start.filter(
        (e) => e.id === id || prev.some((kept) => kept.id === e.id),
      ),
    );

  const context_menu_actions = useMemo(
    () => ({
      handle_archive: (email: InboxEmail) => request("archive", email),
      handle_delete: (email: InboxEmail) => request("delete", email),
      handle_spam: (email: InboxEmail) => request("spam", email),
      handle_move_to_inbox: async (email: InboxEmail) =>
        perform("move_to_inbox", email),
      handle_mark_not_spam: async (email: InboxEmail) =>
        perform("not_spam", email),
      handle_restore: async (email: InboxEmail) => perform("restore", email),
      handle_toggle_read: () => Promise.resolve(),
      handle_toggle_star: () => Promise.resolve(),
      handle_toggle_pin: () => Promise.resolve(),
    }),
    [request, perform],
  );

  const toolbar = useMemo(
    () => ({
      show_single_archive_confirm: confirming?.kind === "archive",
      show_single_delete_confirm: confirming?.kind === "delete",
      show_single_spam_confirm: confirming?.kind === "spam",
    }),
    [confirming],
  );

  const email_state = useMemo(
    () => ({
      emails,
      is_loading: false,
      is_loading_more: false,
      total_messages: emails.length,
      has_more: false,
      has_initial_load: true,
      has_load_error: false,
    }),
    [emails],
  );

  view_state.current = {
    ...STABLE_VIEW_STATE,
    email_state,
    toolbar,
    context_menu_actions,
  };
  inbox = use_email_inbox_state(props);

  return null;
}

function Page({ current_view }: { current_view: string }) {
  const [split_email_id, set_split_email_id] = useState<string | null>(null);
  const [visible_ids, set_visible_ids] = useState<string[]>([]);
  const current_index = split_email_id
    ? visible_ids.indexOf(split_email_id)
    : -1;
  const handle_auto_advance = use_auto_advance({
    email_ids: visible_ids,
    current_index,
    navigate_to: set_split_email_id,
  });
  const handle_email_list_change = useCallback(
    (ids: string[]) => set_visible_ids(ids),
    [],
  );
  const handle_split_close = useCallback(() => set_split_email_id(null), []);
  const act_on_open_email = (event_name: string) => () => {
    if (!split_email_id) return;
    window.dispatchEvent(
      new CustomEvent(event_name, { detail: { id: split_email_id } }),
    );
  };

  page.split_email_id = split_email_id;
  page.visible_ids = visible_ids;
  page.open = set_split_email_id;

  use_keyboard_shortcuts({
    is_any_modal_open: false,
    has_focused_email: false,
    has_viewed_email: !!split_email_id,
    handlers: {
      on_next_email: () => {
        if (current_index !== -1 && current_index < visible_ids.length - 1) {
          set_split_email_id(visible_ids[current_index + 1]);
        }
      },
      on_prev_email: () => {
        if (current_index > 0) {
          set_split_email_id(visible_ids[current_index - 1]);
        }
      },
      on_archive: act_on_open_email("astermail:keyboard-archive"),
      on_delete: act_on_open_email("astermail:keyboard-delete"),
      on_spam: act_on_open_email("astermail:keyboard-spam"),
    },
  });

  return (
    <Inbox
      current_view={current_view}
      on_auto_advance={handle_auto_advance}
      on_email_list_change={handle_email_list_change}
      on_settings_click={noop}
      on_split_close={handle_split_close}
      split_email_id={split_email_id}
    />
  );
}

const press = (key: string) =>
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });

const email = (id: string) =>
  emails_at_start.find((e) => e.id === id) as InboxEmail;

describe("use_email_inbox_state with an email open in the split reader", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_with_open = (open_id: string, current_view = "inbox") => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Page current_view={current_view} />
        </MemoryRouter>,
      );
    });
    act(() => page.open(open_id));
  };

  beforeEach(() => {
    preferences_mock.auto_advance = "Go to next message";
    confirm_before.archive = false;
    confirm_before.delete = false;
    confirm_before.spam = false;
    performed.length = 0;
    inbox = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the next email when e archives the one being read", () => {
    render_with_open("b");

    press("e");

    expect(performed).toEqual(["archive:b"]);
    expect(page.visible_ids).toEqual(["a", "c", "d"]);
    expect(page.split_email_id).toBe("c");
  });

  it("keeps j and k working after the reader moves on", async () => {
    render_with_open("b");

    press("e");
    press("j");

    expect(page.split_email_id).toBe("d");

    await new Promise((resolve) => setTimeout(resolve, 80));
    press("k");

    expect(page.split_email_id).toBe("c");
  });

  it("closes the reader after # when the preference is to go back to the list", () => {
    preferences_mock.auto_advance = "Go back to message list";
    render_with_open("b");

    press("#");

    expect(performed).toEqual(["delete:b"]);
    expect(page.split_email_id).toBeNull();
  });

  it("opens the previous email after ! when the preference says so", () => {
    preferences_mock.auto_advance = "Go to previous message";
    render_with_open("c");

    press("!");

    expect(performed).toEqual(["spam:c"]);
    expect(page.split_email_id).toBe("a");
  });

  it("skips the sender's other mail that ! takes out of the list too", () => {
    render_with_open("b");

    press("!");

    expect(page.visible_ids).toEqual(["a", "d"]);
    expect(page.split_email_id).toBe("d");
  });

  it("moves on when the row's own archive or delete acts on the open email", () => {
    render_with_open("b");

    act(() => inbox!.context_menu_actions.handle_archive(email("b")));

    expect(page.split_email_id).toBe("c");

    act(() => inbox!.context_menu_actions.handle_delete(email("c")));

    expect(page.split_email_id).toBe("d");
    expect(performed).toEqual(["archive:b", "delete:c"]);
  });

  it("opens the next email after e moves the open one back to the inbox", () => {
    render_with_open("b", "archive");

    press("e");

    expect(performed).toEqual(["move_to_inbox:b"]);
    expect(page.split_email_id).toBe("c");
  });

  it("leaves the reader alone when another row is archived or deleted", () => {
    render_with_open("b");

    act(() => inbox!.context_menu_actions.handle_archive(email("c")));
    act(() => inbox!.context_menu_actions.handle_delete(email("a")));

    expect(page.visible_ids).toEqual(["b", "d"]);
    expect(page.split_email_id).toBe("b");
  });

  it("waits for the confirmation before moving on", () => {
    confirm_before.delete = true;
    render_with_open("b");

    press("#");

    expect(page.visible_ids).toEqual(["a", "b", "c", "d"]);
    expect(page.split_email_id).toBe("b");

    act(() => list_controls.confirm());

    expect(performed).toEqual(["delete:b"]);
    expect(page.split_email_id).toBe("c");
  });

  it("brings the email back on undo without pulling the reader back", () => {
    render_with_open("b");

    press("e");
    act(() => list_controls.restore("b"));

    expect(page.visible_ids).toEqual(["a", "b", "c", "d"]);
    expect(page.split_email_id).toBe("c");

    press("k");

    expect(page.split_email_id).toBe("b");
  });

  it("stays on the email when the confirmation is cancelled", () => {
    confirm_before.archive = true;
    render_with_open("b");

    press("e");
    act(() => list_controls.cancel());

    expect(page.split_email_id).toBe("b");

    act(() => list_controls.drop("b"));

    expect(performed).toEqual([]);
    expect(page.split_email_id).toBe("b");
  });
});
