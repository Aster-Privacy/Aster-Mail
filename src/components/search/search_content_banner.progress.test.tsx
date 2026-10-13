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

const progress_state = {
  building: false,
  current: 0,
  total: 0,
  session: 0,
};

const download_state = {
  paused: false,
  done: 0,
  total: 0,
};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "user@astermail.org" } }),
}));

vi.mock("@/components/ui/info_popover", () => ({
  InfoPopover: () => null,
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Switch: () => null,
}));

vi.mock("@/components/search/search_indexing_notice", () => ({
  use_download_eta: () => null,
  SearchIndexBadge: (props: {
    is_paused: boolean;
    done: number;
    total: number;
    percent: number;
    on_pause?: () => void;
  }) => (
    <div
      data-can-pause={props.on_pause ? "true" : "false"}
      data-done={props.done}
      data-paused={props.is_paused ? "true" : "false"}
      data-percent={props.percent}
      data-testid="index-badge"
      data-total={props.total}
    />
  ),
}));

vi.mock("@/hooks/use_search", () => ({
  pause_index_download: vi.fn(),
  resume_index_download: vi.fn(),
  use_indexing_progress: () => progress_state,
  use_index_download_state: () => download_state,
}));

const { SearchContentBanner } = await import("./search_content_banner");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function banner() {
  return (
    <SearchContentBanner enabled on_disable={() => {}} on_enable={() => {}} />
  );
}

function render(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(banner());
  });

  return container;
}

function rerender() {
  act(() => {
    root!.render(banner());
  });
}

function badge(el: HTMLDivElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('[data-testid="index-badge"]');
}

function attr(el: HTMLDivElement, name: string): string | undefined {
  return badge(el)?.getAttribute(`data-${name}`) ?? undefined;
}

beforeEach(() => {
  progress_state.building = false;
  progress_state.current = 0;
  progress_state.total = 0;
  progress_state.session = 0;
  download_state.paused = false;
  download_state.done = 0;
  download_state.total = 0;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("SearchContentBanner index badge", () => {
  it("keeps the row to one line with no badge when nothing is downloading", () => {
    const el = render();

    expect(badge(el)).toBeNull();
    expect(el.querySelectorAll(".search_divider_b")).toHaveLength(1);
    expect(el.textContent).toBe("mail.searching_message_content");
  });

  it("shows the counts once a total is known", () => {
    progress_state.building = true;
    progress_state.current = 40;
    progress_state.total = 200;

    const el = render();

    expect(attr(el, "done")).toBe("40");
    expect(attr(el, "total")).toBe("200");
  });

  it("shows an indeterminate badge while the total is still unknown", () => {
    progress_state.building = true;

    const el = render();

    expect(badge(el)).not.toBeNull();
    expect(attr(el, "total")).toBe("0");
  });

  it("hides the badge when the index has finished but counters are latched", () => {
    progress_state.building = false;
    progress_state.current = 200;
    progress_state.total = 200;

    const el = render();

    expect(badge(el)).toBeNull();
  });

  it("keeps the counts when the reported total briefly drops out", () => {
    progress_state.building = true;
    progress_state.current = 40;
    progress_state.total = 200;

    const el = render();

    progress_state.current = 0;
    progress_state.total = 0;
    rerender();

    expect(attr(el, "done")).toBe("40");
    expect(attr(el, "total")).toBe("200");
  });

  it("never walks the progress backwards within a session", () => {
    progress_state.building = true;
    progress_state.current = 120;
    progress_state.total = 200;

    const el = render();

    expect(attr(el, "percent")).toBe("60");

    progress_state.current = 20;
    rerender();

    expect(attr(el, "percent")).toBe("60");
  });

  it("never reaches 100% while the download is still running", () => {
    progress_state.building = true;
    progress_state.current = 200;
    progress_state.total = 200;

    const el = render();

    expect(attr(el, "percent")).toBe("99");
    expect(attr(el, "can-pause")).toBe("true");
  });

  it("shows only the running count while the total is unknown", () => {
    progress_state.building = true;
    progress_state.current = 400;
    progress_state.total = 0;

    const el = render();

    expect(attr(el, "done")).toBe("400");
    expect(attr(el, "total")).toBe("0");
  });

  it("starts from the new counts when a new session begins", () => {
    progress_state.building = true;
    progress_state.current = 120;
    progress_state.total = 200;
    progress_state.session = 1;

    const el = render();

    progress_state.current = 20;
    progress_state.total = 400;
    progress_state.session = 2;
    rerender();

    expect(attr(el, "percent")).toBe("5");
  });

  it("reaches 100% only after the download has finished", () => {
    progress_state.building = true;
    progress_state.current = 120;
    progress_state.total = 200;
    progress_state.session = 1;

    const el = render();

    progress_state.building = false;
    progress_state.current = 180;
    progress_state.total = 180;
    rerender();

    expect(attr(el, "percent")).toBe("100");
    expect(attr(el, "can-pause")).toBe("false");
  });

  it("keeps the last counts when the download stops before the end", () => {
    progress_state.building = true;
    progress_state.current = 120;
    progress_state.total = 200;
    progress_state.session = 1;

    const el = render();

    progress_state.building = false;
    rerender();

    expect(attr(el, "percent")).toBe("60");
  });

  it("shows a paused badge with the saved counts", () => {
    progress_state.building = false;
    download_state.paused = true;
    download_state.done = 120;
    download_state.total = 400;

    const el = render();

    expect(attr(el, "paused")).toBe("true");
    expect(attr(el, "done")).toBe("120");
    expect(attr(el, "total")).toBe("400");
  });
});
