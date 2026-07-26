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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/use_platform", () => ({
  use_platform: () => ({ safe_area_insets: { bottom: 0 } }),
}));

vi.mock("@/native/haptic_feedback", () => ({
  haptic_impact: () => {},
}));

const { row_renders } = vi.hoisted(() => ({ row_renders: { count: 0 } }));

vi.mock("@/components/mobile/mobile_email_row", () => ({
  MobileEmailRow: ({ email }: { email: InboxEmail }) => {
    row_renders.count++;

    return <div data-email-id={email.id}>{email.subject}</div>;
  },
}));

vi.mock("framer-motion", () => ({
  motion: { button: "button" },
  AnimatePresence: ({ children }: { children?: unknown }) => children as never,
}));

const { MobileEmailList } = await import(
  "@/components/mobile/mobile_email_list"
);
const { MOBILE_WINDOW_MIN_ROWS } = await import(
  "@/components/mobile/list_window"
);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function make_emails(count: number): InboxEmail[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    subject: `Subject ${i}`,
    sender_name: `Sender ${i}`,
    sender_email: `s${i}@example.com`,
    preview: "preview",
    timestamp: "10:00",
    is_read: true,
    is_starred: false,
    has_attachment: false,
  })) as unknown as InboxEmail[];
}

const noop = () => {};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(emails: InboxEmail[]): void {
  act(() => {
    root!.render(
      <MobileEmailList
        current_view="inbox"
        emails={emails}
        has_more={false}
        is_loading={false}
        on_email_press={noop}
        on_load_more={noop}
        on_long_press={noop}
      />,
    );
  });
}

function scroller(): HTMLElement {
  return container!.querySelector(".overflow-y-auto") as HTMLElement;
}

function mounted_indexes(): number[] {
  return Array.from(
    container!.querySelectorAll<HTMLElement>("[data-row-index]"),
  ).map((node) => Number(node.dataset.rowIndex));
}

function scroll_to(top: number): void {
  const el = scroller();

  el.scrollTop = top;
  act(() => {
    el.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  row_renders.count = 0;
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
});

describe("MobileEmailList windowing", () => {
  it("mounts every row for a short list", () => {
    render(make_emails(20));

    expect(container!.querySelectorAll("[data-email-id]").length).toBe(20);
    expect(mounted_indexes()).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("mounts every row right up to the windowing threshold", () => {
    render(make_emails(MOBILE_WINDOW_MIN_ROWS));

    expect(container!.querySelectorAll("[data-email-id]").length).toBe(
      MOBILE_WINDOW_MIN_ROWS,
    );
  });

  it("bounds the mounted rows for a long list", () => {
    render(make_emails(5000));

    const mounted = container!.querySelectorAll("[data-email-id]").length;

    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(60);
  });

  it("never mounts the whole list, not even on the first render", () => {
    render(make_emails(5000));

    expect(row_renders.count).toBeLessThan(200);
  });

  it("keeps the mounted count bounded as the list grows", () => {
    render(make_emails(5000));

    const small = container!.querySelectorAll("[data-email-id]").length;

    render(make_emails(100000));

    expect(container!.querySelectorAll("[data-email-id]").length).toBe(small);
  });

  it("moves the window when the user scrolls", () => {
    render(make_emails(5000));

    expect(mounted_indexes()[0]).toBe(0);

    scroll_to(40000);

    const after = mounted_indexes();

    expect(after[0]).toBeGreaterThan(400);
    expect(after.length).toBeLessThan(60);
  });

  it("returns to the head of the list when scrolled back up", () => {
    render(make_emails(5000));

    scroll_to(40000);
    scroll_to(0);

    expect(mounted_indexes()[0]).toBe(0);
  });

  it("reserves the height of the rows it did not mount", () => {
    render(make_emails(5000));

    const list = container!.querySelector("[data-row-index]")!
      .parentElement as HTMLElement;
    const pads = Array.from(list.children).filter(
      (child) => (child as HTMLElement).style.height,
    );

    expect(pads.length).toBe(1);
    expect(
      Number.parseInt((pads[0] as HTMLElement).style.height, 10),
    ).toBeGreaterThan(100000);
  });

  it("keeps rows reachable by the drag-select lookup", () => {
    render(make_emails(5000));

    scroll_to(40000);

    const row = container!.querySelector("[data-email-id]") as HTMLElement;

    expect(row.closest("[data-email-id]")).toBe(row);
    expect(row.dataset.emailId).toMatch(/^m\d+$/);
  });
});
