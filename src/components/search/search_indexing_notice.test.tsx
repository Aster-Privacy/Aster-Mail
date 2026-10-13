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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const progress_state = vi.hoisted(() => ({
  building: false,
  current: 0,
  total: 0,
  paused: false,
  done: 0,
  download_total: 0,
}));
const resume_mock = vi.hoisted(() => vi.fn());
const pause_mock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "reader@example.org" } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
    language: "en",
  }),
}));

vi.mock("@/hooks/use_search/progress", () => ({
  use_indexing_progress: () => ({
    building: progress_state.building,
    current: progress_state.current,
    total: progress_state.total,
    session: 1,
  }),
  use_index_download_state: () => ({
    paused: progress_state.paused,
    done: progress_state.done,
    total: progress_state.download_total,
  }),
  pause_index_download: pause_mock,
  resume_index_download: resume_mock,
}));

const {
  SearchEmptyState,
  SearchIndexStatusBadge,
  resolve_index_status,
  use_search_index_status,
} = await import("./search_indexing_notice");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness({ pending }: { pending: boolean }) {
  const status = use_search_index_status(pending, 0);

  return <SearchIndexStatusBadge search_content={false} status={status} />;
}

function render(pending: boolean) {
  act(() => {
    root!.render(<Harness pending={pending} />);
  });
}

beforeEach(() => {
  Object.assign(progress_state, {
    building: false,
    current: 0,
    total: 0,
    paused: false,
    done: 0,
    download_total: 0,
  });
  resume_mock.mockReset();
  pause_mock.mockReset();
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

const idle = { building: false, current: 0, total: 0 };
const not_paused = { paused: false, done: 0, total: 0 };

describe("resolve_index_status", () => {
  it("is inactive once the index covers the mailbox", () => {
    const status = resolve_index_status(
      false,
      900,
      { building: true, current: 900, total: 900 },
      not_paused,
    );

    expect(status.is_active).toBe(false);
    expect(status.is_paused).toBe(false);
  });

  it("is inactive when nothing is building and nothing is paused", () => {
    expect(resolve_index_status(true, 40, idle, not_paused).is_active).toBe(
      false,
    );
  });

  it("reports one pair of counts while building", () => {
    const status = resolve_index_status(
      true,
      4000,
      { building: true, current: 4800, total: 13922 },
      { paused: false, done: 100, total: 200 },
    );

    expect(status.is_active).toBe(true);
    expect(status.done).toBe(4800);
    expect(status.total).toBe(13922);
    expect(status.percent).toBeGreaterThan(0);
    expect(status.percent).toBeLessThan(100);
  });

  it("uses the saved checkpoint while paused", () => {
    const status = resolve_index_status(true, 0, idle, {
      paused: true,
      done: 4800,
      total: 13922,
    });

    expect(status.is_active).toBe(true);
    expect(status.is_paused).toBe(true);
    expect(status.done).toBe(4800);
    expect(status.total).toBe(13922);
  });

  it("is active while a first search waits on a running index build", () => {
    const building = { building: true, current: 0, total: 0 };

    expect(
      resolve_index_status(false, 0, building, not_paused, true).is_active,
    ).toBe(true);
    expect(
      resolve_index_status(false, 0, idle, not_paused, true).is_active,
    ).toBe(false);
  });

  it("never reports more indexed messages than the total", () => {
    const status = resolve_index_status(
      true,
      120,
      { building: true, current: 50, total: 100 },
      not_paused,
    );

    expect(status.done).toBe(120);
    expect(status.total).toBe(120);
  });

  it("keeps the total unknown until the mailbox size is reported", () => {
    const status = resolve_index_status(
      true,
      30,
      { building: true, current: 30, total: 0 },
      not_paused,
    );

    expect(status.total).toBe(0);
  });
});

function badge(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    '[data-testid="search-index-badge"]',
  );
}

function open_badge(): HTMLElement | null {
  act(() => {
    badge()!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    badge()!.click();
  });

  return document.querySelector<HTMLElement>(
    '[data-testid="search-index-badge-popover"]',
  );
}

describe("search index badge", () => {
  it("renders nothing once the index is complete", () => {
    render(false);

    expect(container!.childElementCount).toBe(0);
  });

  it("shows only a ring and a percent while the index builds", () => {
    Object.assign(progress_state, {
      building: true,
      current: 4800,
      total: 13922,
    });
    render(true);

    expect(badge()?.textContent).toBe("34%");
    expect(badge()?.getAttribute("aria-label")).toBe(
      "mail.search_index_title, 34%",
    );
    expect(document.body.textContent).not.toContain("mail.search_index_why");
  });

  it("explains indexing in a short popover", () => {
    Object.assign(progress_state, {
      building: true,
      current: 4800,
      total: 13922,
    });
    render(true);

    const popover = open_badge();

    expect(popover?.textContent).toContain("mail.search_index_title");
    expect(popover?.textContent).toContain(
      'mail.search_index_progress {"done":"4,800","total":"13,922"}',
    );
    expect(popover?.textContent).toContain("mail.search_index_why");

    act(() => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="search-index-badge-pause"]',
        )!
        .click();
    });

    expect(pause_mock).toHaveBeenCalled();
  });

  it("offers to resume from the popover when indexing is paused", () => {
    Object.assign(progress_state, {
      paused: true,
      done: 4800,
      download_total: 13922,
    });
    render(true);

    const popover = open_badge();

    expect(popover?.textContent).toContain("mail.search_index_paused_title");

    act(() => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="search-index-badge-resume"]',
        )!
        .click();
    });

    expect(resume_mock).toHaveBeenCalledWith("reader@example.org", false);
  });
});

describe("search empty state", () => {
  it("renders a title, one line, and action chips", () => {
    const on_click = vi.fn();

    act(() => {
      root!.render(
        <SearchEmptyState
          actions={[{ label: "Clear filters", on_click, testid: "clear" }]}
          body="Filters are active."
          icon={() => <svg />}
          title="No matches yet"
        />,
      );
    });

    const state = document.querySelector('[data-testid="search-empty-state"]');

    expect(state?.getAttribute("role")).toBe("status");
    expect(state?.textContent).toBe(
      "No matches yetFilters are active.Clear filters",
    );

    act(() => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="clear"]')!
        .click();
    });

    expect(on_click).toHaveBeenCalled();
  });
});
