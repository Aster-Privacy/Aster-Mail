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
import { MemoryRouter } from "react-router-dom";

const search_mock = vi.fn();
const clear_results_mock = vi.fn();
const index_state = vi.hoisted(() => ({
  index_pending: false,
  indexed_count: 0,
  building: false,
  paused: false,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "reader@example.org" } }),
}));

vi.mock("@/hooks/use_search/progress", () => ({
  use_indexing_progress: () => ({
    building: index_state.building,
    current: index_state.indexed_count,
    total: 400,
    session: 1,
  }),
  use_index_download_state: () => ({
    paused: index_state.paused,
    done: index_state.indexed_count,
    total: 400,
  }),
  resume_index_download: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {}, update_preference: vi.fn() }),
}));

vi.mock("@/hooks/use_email_actions", () => ({
  use_email_actions: () => ({ toggle_star: vi.fn() }),
}));

vi.mock("@/components/mobile/mobile_header", () => ({
  MobileHeader: () => null,
}));

vi.mock("@/components/mobile/mobile_email_row", () => ({
  MobileEmailRow: () => null,
}));

vi.mock("@/hooks/use_search", () => ({
  use_search: () => ({
    state: {
      results: [],
      is_searching: false,
      index_building: false,
      error: null,
      index_pending: index_state.index_pending,
      indexed_count: index_state.indexed_count,
    },
    search: search_mock,
    clear_results: clear_results_mock,
  }),
}));

const { default: MobileSearchPage } = await import("./mobile_search_page");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  search_mock.mockReset();
  clear_results_mock.mockReset();
  index_state.index_pending = false;
  index_state.indexed_count = 0;
  index_state.building = false;
  index_state.paused = false;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
});

function render_page(search_view?: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter
        initialEntries={[{ pathname: "/search", state: { search_view } }]}
      >
        <MobileSearchPage />
      </MemoryRouter>,
    );
  });

  return container.querySelector("input") as HTMLInputElement;
}

function submit(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.form!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

function chip(filter: string): HTMLButtonElement {
  const match = document.querySelector(`button[data-filter="${filter}"]`);

  if (!match) throw new Error(`no chip for ${filter}`);

  return match as HTMLButtonElement;
}

function press(filter: string) {
  act(() => {
    chip(filter).click();
  });
}

describe("MobileSearchPage filter chips", () => {
  it.each([
    ["unread", "report is:unread"],
    ["attachments", "report has:attachment"],
    ["starred", "report is:starred"],
  ])("writes the %s chip into the query", (filter, query) => {
    const input = render_page("inbox");

    submit(input, "report");
    press(filter);

    expect(search_mock).toHaveBeenLastCalledWith(query);
    expect(input.value).toBe(query);
    expect(chip(filter).getAttribute("aria-pressed")).toBe("true");
    expect(chip("all").getAttribute("aria-pressed")).toBe("false");

    press(filter);

    expect(search_mock).toHaveBeenLastCalledWith("report");
    expect(chip(filter).getAttribute("aria-pressed")).toBe("false");
    expect(chip("all").getAttribute("aria-pressed")).toBe("true");
  });

  it("reads the chip state from an operator typed by hand", () => {
    const input = render_page("inbox");

    submit(input, "report is:unread has:attachment");

    expect(chip("unread").getAttribute("aria-pressed")).toBe("true");
    expect(chip("attachments").getAttribute("aria-pressed")).toBe("true");
    expect(chip("starred").getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the Trash scope when a chip changes the query", () => {
    const input = render_page("trash");

    submit(input, "report");
    press("unread");

    expect(search_mock).toHaveBeenLastCalledWith("report in:trash is:unread");

    press("all");

    expect(search_mock).toHaveBeenLastCalledWith("report in:trash");
  });

  it("scopes every later submit from Trash, not only the first", () => {
    const input = render_page("trash");

    submit(input, "report");
    submit(input, "invoice");

    expect(search_mock).toHaveBeenLastCalledWith("invoice in:trash");
  });

  it("does not submit an operator with no value", () => {
    const input = render_page("inbox");

    submit(input, "report from:");

    expect(search_mock).not.toHaveBeenCalled();
  });

  it("says filters are active and clears them without losing the text", () => {
    const input = render_page("trash");

    submit(input, "report is:unread from:alice");

    expect(document.body.textContent).toContain("mail.search_filters_active");

    act(() => {
      (
        document.querySelector(
          '[data-testid="mobile-search-clear-filters"]',
        ) as HTMLButtonElement
      ).click();
    });

    expect(search_mock).toHaveBeenLastCalledWith("report in:trash");
    expect(input.value).toBe("report in:trash");
    expect(document.body.textContent).toContain("mail.no_results_found");
    expect(
      document.querySelector('[data-testid="mobile-search-clear-filters"]'),
    ).toBeNull();
  });

  it("shows indexing progress, not an empty result, while the index builds", () => {
    index_state.index_pending = true;
    index_state.indexed_count = 120;
    index_state.building = true;

    const input = render_page("inbox");

    submit(input, "report");

    expect(
      document.querySelector('[data-testid="mobile-search-indexing"]'),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("mail.search_index_title");
    expect(document.body.textContent).toContain("mail.search_index_why");
    expect(document.body.textContent).not.toContain("mail.no_results_found");
  });

  it("offers to resume indexing when it is paused", () => {
    index_state.index_pending = true;
    index_state.indexed_count = 120;
    index_state.paused = true;

    const input = render_page("inbox");

    submit(input, "report");

    expect(
      document.querySelector('[data-testid="search-indexing-resume"]'),
    ).not.toBeNull();
    expect(document.body.textContent).toContain(
      "mail.search_index_paused_title",
    );
    expect(document.body.textContent).not.toContain("mail.no_results_found");
  });

  it("shows the empty result when the index is short but nothing is indexing", () => {
    index_state.index_pending = true;
    index_state.indexed_count = 120;

    const input = render_page("inbox");

    submit(input, "report");

    expect(
      document.querySelector('[data-testid="mobile-search-indexing"]'),
    ).toBeNull();
    expect(document.body.textContent).toContain("mail.no_results_found");
  });

  it("shows the empty result once the index is complete", () => {
    const input = render_page("inbox");

    submit(input, "report");

    expect(
      document.querySelector('[data-testid="mobile-search-indexing"]'),
    ).toBeNull();
    expect(document.body.textContent).toContain("mail.no_results_found");
  });
});
