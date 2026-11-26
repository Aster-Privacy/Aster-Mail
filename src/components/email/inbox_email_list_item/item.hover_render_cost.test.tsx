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
import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: () => null,
  subscribe_aliases: () => () => {},
}));

vi.mock("@/hooks/use_alias_delivery", () => ({
  normalize_alias_candidates: () => "",
  use_alias_row_info: () => ({ delivery: null, custom_domain_label: null }),
}));

const row_renders = vi.hoisted(() => new Map<string, number>());

vi.mock("@/hooks/pending_thread_replies", () => ({
  use_shown_thread_count: (token: string | undefined, count: number) => {
    const key = token ?? "";

    row_renders.set(key, (row_renders.get(key) ?? 0) + 1);

    return count ?? 1;
  },
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

const { InboxEmailListItem } =
  await import("@/components/email/inbox_email_list_item/item");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROWS = 30;

function make_email(i: number): InboxEmail {
  return {
    id: `email-${i}`,
    item_type: "received",
    thread_token: `email-${i}`,
    sender_name: `Sender ${i}`,
    sender_email: `sender${i}@example.org`,
    subject:
      i % 3 === 0 ? `Your sign-in code is 6127${i % 10}6` : `Update ${i}`,
    preview: `Preview line ${i}`,
    timestamp: "10:40",
    is_read: i % 2 === 0,
    is_starred: i % 5 === 0,
    is_selected: false,
    has_attachment: i % 2 === 0,
    folders: [],
    tags: [],
  } as unknown as InboxEmail;
}

const emails = Array.from({ length: ROWS }, (_, i) => make_email(i));
const noop = () => {};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let commits = 0;

function render_list(active_id: string | null) {
  act(() => {
    root!.render(
      <Profiler
        id="rows"
        onRender={() => {
          commits += 1;
        }}
      >
        {emails.map((email) => (
          <div key={email.id} data-row-email-id={email.id}>
            <InboxEmailListItem
              current_view="inbox"
              density="comfortable"
              email={email}
              is_active={email.id === active_id}
              on_archive={noop}
              on_delete={noop}
              on_email_click={noop}
              on_spam={noop}
              on_toggle_read={noop}
              on_toggle_select={noop}
              on_toggle_star={noop}
              show_email_preview={true}
              show_profile_pictures={true}
            />
          </div>
        ))}
      </Profiler>,
    );
  });
}

function rows(): HTMLElement[] {
  return [
    ...container!.querySelectorAll<HTMLElement>("[data-row-email-id] > div"),
  ];
}

function hover(from: Element | null, to: Element) {
  act(() => {
    if (from) {
      from.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: to }),
      );
    }
    to.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, relatedTarget: from }),
    );
  });
}

function sweep() {
  let prev: Element | null = null;

  for (const row of rows()) {
    hover(prev, row);
    prev = row;
  }
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  commits = 0;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("inbox row hover cost", () => {
  it("hovering across rows commits no React renders", () => {
    render_list(null);
    commits = 0;
    sweep();

    expect(commits).toBe(0);
  });

  it("hover actions are in the DOM before the first hover", () => {
    render_list(null);

    for (const row of rows()) {
      expect(row.querySelector('[data-testid="row-hover-actions"]')).not.toBe(
        null,
      );
    }
  });

  it("rows mount no per-row tooltip roots", () => {
    render_list(null);
    sweep();

    const tooltip_triggers = container!.querySelectorAll(
      '[data-state="closed"], [data-state="delayed-open"], [data-state="instant-open"]',
    );

    expect(tooltip_triggers.length).toBe(0);
  });

  it("hover action buttons keep an accessible label and a tip", () => {
    render_list(null);
    const strip = rows()[0].querySelector('[data-testid="row-hover-actions"]');
    const buttons = [...strip!.querySelectorAll("button")];

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.getAttribute("aria-label")).toBeTruthy();
      expect(button.getAttribute("title")).toBeTruthy();
    }
  });

  it("changing the active row rerenders only the rows that changed", () => {
    render_list("email-3");
    row_renders.clear();
    render_list("email-7");

    expect([...row_renders.keys()].sort()).toEqual(["email-3", "email-7"]);
  });
});
