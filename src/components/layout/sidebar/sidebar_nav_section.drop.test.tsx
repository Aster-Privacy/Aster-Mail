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
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

import * as category_drag from "@/components/email/inbox/category_drag";

import { SidebarNavSection } from "./sidebar_nav_section";

const STATS = {
  inbox: 4,
  unread: 2,
  drafts: 1,
  scheduled: 0,
  snoozed: 0,
  total_items: 20,
  archived: 3,
  spam: 5,
  trash: 7,
  contacts: 0,
};

type Payload = category_drag.EmailDragPayload & {
  source_id?: string;
  location?: string;
  all_starred?: boolean;
};

interface DropCall {
  target: string;
  ids: string[];
}

interface DropRegistry {
  register_system_drop_handler?: (handler: {
    owns: (payload: Payload) => boolean;
    run: (target: string, payload: Payload) => void;
  }) => () => void;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let calls: DropCall[] = [];
let unregister: (() => void) | undefined;

function make_transfer(): DataTransfer {
  const data = new Map<string, string>();

  return {
    dropEffect: "none",
    effectAllowed: "none",
    get types() {
      return Array.from(data.keys());
    },
    setData(type: string, value: string) {
      data.set(type, value);
    },
    getData(type: string) {
      return data.get(type) ?? "";
    },
    setDragImage() {},
  } as unknown as DataTransfer;
}

function start_drag(overrides: Partial<Payload> = {}): DataTransfer {
  const transfer = make_transfer();
  const payload: Payload = {
    ids: ["m1"],
    folder_tokens: [],
    tag_tokens: [],
    is_scope: false,
    source_id: "m1",
    location: "inbox",
    all_starred: false,
    ...overrides,
  };

  category_drag.write_email_drag(
    transfer,
    payload as category_drag.EmailDragPayload,
  );
  act(() => {
    category_drag.begin_category_drag();
  });

  return transfer;
}

function fire(
  element: Element,
  type: "dragenter" | "dragover" | "drop",
  transfer: DataTransfer,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.defineProperty(event, "dataTransfer", { value: transfer });
  act(() => {
    element.dispatchEvent(event);
  });

  return event;
}

function row(label: string): HTMLButtonElement {
  const button = Array.from(
    container!.querySelectorAll<HTMLButtonElement>("button.sidebar-nav-btn"),
  ).find((candidate) => candidate.textContent?.includes(label));

  if (!button) throw new Error(`missing row ${label}`);

  return button;
}

function render_nav(section_collapsed = false, on_toggle_section = () => {}) {
  act(() => {
    root!.render(
      createElement(SidebarNavSection, {
        is_collapsed: false,
        effective_selected: "inbox",
        stats: STATS,
        section_collapsed,
        on_toggle_section,
        handle_nav_click: (cb: () => void) => cb(),
        set_selected_item: () => {},
        navigate: () => {},
        inbox_ref: createRef(),
        sent_ref: createRef(),
        scheduled_ref: createRef(),
        snoozed_ref: createRef(),
        drafts_ref: createRef(),
        starred_ref: createRef(),
        all_mail_ref: createRef(),
        archive_ref: createRef(),
        spam_ref: createRef(),
        trash_ref: createRef(),
        contacts_ref: createRef(),
        subscriptions_ref: createRef(),
      } as unknown as Parameters<typeof SidebarNavSection>[0]),
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  calls = [];
  unregister = (category_drag as DropRegistry).register_system_drop_handler?.(
    {
      owns: (payload) => payload.source_id === "m1",
      run: (target, payload) => {
        calls.push({ target, ids: payload.ids });
      },
    },
  );
});

afterEach(() => {
  unregister?.();
  act(() => {
    category_drag.end_category_drag();
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("SidebarNavSection system folder drops", () => {
  it.each(["mail.archive", "mail.spam", "mail.trash", "mail.starred"])(
    "accepts dragged mail on %s and runs the matching action",
    (label) => {
      render_nav();
      const transfer = start_drag();
      const target = row(label);

      fire(target, "dragenter", transfer);
      const over = fire(target, "dragover", transfer);

      expect(over.defaultPrevented).toBe(true);
      expect(transfer.dropEffect).toBe("move");

      fire(target, "drop", transfer);

      expect(calls).toEqual([
        { target: label.slice("mail.".length), ids: ["m1"] },
      ]);
    },
  );

  it("accepts archived mail on Inbox", () => {
    render_nav();
    const transfer = start_drag({ location: "archive" });

    fire(row("mail.inbox"), "dragover", transfer);
    expect(transfer.dropEffect).toBe("move");
    fire(row("mail.inbox"), "drop", transfer);

    expect(calls).toEqual([{ target: "inbox", ids: ["m1"] }]);
  });

  it("highlights only the row under the pointer and clears it when the drag ends", () => {
    render_nav();
    const transfer = start_drag();

    fire(row("mail.archive"), "dragover", transfer);

    const highlighted = () =>
      Array.from(container!.querySelectorAll("[data-drop-target]"))
        .filter((node) => node.className.includes("ring-brand"))
        .map((node) => node.getAttribute("data-drop-target"));

    expect(highlighted()).toEqual(["archive"]);

    act(() => {
      category_drag.end_category_drag();
    });

    expect(highlighted()).toEqual([]);
  });

  it.each([
    "mail.sent",
    "mail.drafts",
    "mail.scheduled",
    "mail.snoozed",
    "mail.all_mail",
    "common.subscriptions",
    "common.contacts",
  ])("refuses drops on %s", (label) => {
    render_nav();
    const transfer = start_drag();
    const target = row(label);

    const over = fire(target, "dragover", transfer);

    expect(over.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("none");

    fire(target, "drop", transfer);

    expect(calls).toEqual([]);
  });

  it("does nothing when mail is dropped on the folder it is already in", () => {
    render_nav();
    const transfer = start_drag({ location: "archive" });

    fire(row("mail.archive"), "dragover", transfer);
    expect(transfer.dropEffect).toBe("none");
    fire(row("mail.archive"), "drop", transfer);

    expect(calls).toEqual([]);
  });

  it("never sends a draft to Spam", () => {
    render_nav();
    const transfer = start_drag({ location: "drafts" });

    fire(row("mail.spam"), "dragover", transfer);
    fire(row("mail.spam"), "drop", transfer);

    expect(transfer.dropEffect).toBe("none");
    expect(calls).toEqual([]);
  });

  it("ignores drags whose mail no list on screen owns", () => {
    render_nav();
    const transfer = start_drag({ source_id: "elsewhere" });

    fire(row("mail.trash"), "dragover", transfer);
    fire(row("mail.trash"), "drop", transfer);

    expect(transfer.dropEffect).toBe("none");
    expect(calls).toEqual([]);
  });

  it("leaves file drags alone", () => {
    render_nav();
    const transfer = make_transfer();

    transfer.setData("Files", "");
    const over = fire(row("mail.trash"), "dragover", transfer);

    expect(over.defaultPrevented).toBe(false);
  });

  it("opens the collapsed More section when mail hovers over it", () => {
    vi.useFakeTimers();
    const on_toggle_section = vi.fn();

    render_nav(true, on_toggle_section);
    const transfer = start_drag();
    const toggle = Array.from(container!.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "common.more",
    );

    fire(toggle!, "dragover", transfer);
    fire(toggle!, "dragover", transfer);
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(on_toggle_section).toHaveBeenCalledTimes(1);
  });
});
