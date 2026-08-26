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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const stats_subscribers = new Set<() => void>();
let unread = 0;

vi.mock("./use_mail_stats", () => ({
  use_mail_stats: () => ({
    stats: { unread },
    is_loading: false,
    error: null,
    refresh: () => {},
    has_initialized: true,
  }),
  get_mail_stats_snapshot: () => ({ unread }),
  subscribe_mail_stats: (callback: () => void) => {
    stats_subscribers.add(callback);

    return () => stats_subscribers.delete(callback);
  },
}));

vi.mock("./use_folders", () => ({
  use_folders: () => ({ state: { folders: [] } }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => ({ user: { display_name: "Aster Team" } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      key === "common.workspace_title" ? String(params?.name) : "Inbox",
  }),
}));

vi.useFakeTimers();

const { use_document_title } = await import("./use_document_title");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function InboxTitle() {
  use_document_title({ view: "inbox" });

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(InboxTitle));
  });
}

function unmount(): void {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
}

function notify_stats(): void {
  act(() => {
    stats_subscribers.forEach((callback) => callback());
  });
}

describe("use_document_title unread count", () => {
  beforeEach(() => {
    unread = 1;
    document.title = "";
  });

  afterEach(() => {
    if (root) unmount();
  });

  it("drops the count when the store clears it without a re-render", () => {
    mount();
    expect(document.title).toBe("(1) Inbox | Aster Team");

    unread = 0;
    notify_stats();

    expect(document.title).toBe("Inbox | Aster Team");
  });

  it("heals a stale count on the heartbeat when nothing notifies", () => {
    mount();
    expect(document.title).toBe("(1) Inbox | Aster Team");

    unread = 0;
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(document.title).toBe("Inbox | Aster Team");
  });

  it("strips an orphaned count when every contributor unmounts", () => {
    mount();
    expect(document.title).toBe("(1) Inbox | Aster Team");

    unmount();

    expect(document.title).toBe("Inbox | Aster Team");
  });
});
