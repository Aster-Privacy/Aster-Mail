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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { search_encrypted_content: false },
    update_preference: vi.fn(),
  }),
}));

vi.mock("@/components/search/advanced_search_modal", () => ({
  AdvancedSearchModal: () => null,
}));

vi.mock("@/components/search/search_content_banner", () => ({
  SearchContentBanner: () => null,
}));

vi.mock("@/hooks/use_search", () => ({
  use_search: () => ({
    state: {
      results: [],
      results_query: "",
      is_searching: false,
      index_building: false,
      correction: null,
      error: null,
    },
    search: search_mock,
    dismiss_correction: vi.fn(),
    clear_results: vi.fn(),
    clear_index: vi.fn(),
    start_index_build: vi.fn(),
  }),
  apply_highlights: (text: string) => text,
  compute_highlight_ranges: () => [],
  extract_query_terms: () => [],
}));

const { SearchBar } = await import("./search_bar");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  search_mock.mockReset();
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

function open_bar(path: string, value: string) {
  const on_search_submit = vi.fn();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <SearchBar on_search_submit={on_search_submit} />
      </MemoryRouter>,
    );
  });

  const input = container.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    input.focus();
  });
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  return { input, on_search_submit };
}

function chip(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );

  if (!match) throw new Error(`no chip labeled ${label}`);

  return match;
}

function press(label: string) {
  act(() => {
    chip(label).click();
  });
}

describe("SearchBar dropdown chips", () => {
  it("toggles has:attachment in the query and shows the state", () => {
    const { input, on_search_submit } = open_bar("/", "report");

    expect(chip("mail.has_attachments").getAttribute("aria-pressed")).toBe(
      "false",
    );

    press("mail.has_attachments");

    expect(input.value).toBe("report has:attachment");
    expect(on_search_submit).toHaveBeenLastCalledWith("report has:attachment");
    expect(chip("mail.has_attachments").getAttribute("aria-pressed")).toBe(
      "true",
    );

    press("mail.has_attachments");

    expect(input.value).toBe("report");
    expect(on_search_submit).toHaveBeenLastCalledWith("report");
    expect(chip("mail.has_attachments").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("reads the attachment chip state from a typed operator", () => {
    open_bar("/", "report has:attachment");

    expect(chip("mail.has_attachments").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("replaces an existing date operator with the week chip", () => {
    const { input, on_search_submit } = open_bar(
      "/",
      "report before:2020-01-01 date:today",
    );

    press("mail.search_within_1_week");

    expect(input.value).toMatch(/^report after:\d{4}-\d{2}-\d{2}$/);
    expect(on_search_submit).toHaveBeenLastCalledWith(input.value);
    expect(chip("mail.search_within_1_week").getAttribute("aria-pressed")).toBe(
      "true",
    );

    press("mail.search_within_1_week");

    expect(input.value).toBe("report");
  });

  it("puts a bare from: in the input without searching", () => {
    const { input, on_search_submit } = open_bar("/", "report");

    press("common.from_label");

    expect(input.value).toBe("report from:");
    expect(on_search_submit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);

    press("common.from_label");

    expect(input.value).toBe("report from:");
  });

  it("does not submit a bare prefix on Enter", () => {
    const { input, on_search_submit } = open_bar("/", "report from:");

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(on_search_submit).not.toHaveBeenCalled();
  });

  it("keeps the Trash scope on a chip submit", () => {
    const { on_search_submit } = open_bar("/trash", "report");

    press("mail.has_attachments");

    expect(on_search_submit).toHaveBeenLastCalledWith(
      "report has:attachment in:trash",
    );
  });
});
