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
  vi.useRealTimers();
});

function render_bar(path: string, search_context?: string) {
  const on_search_submit = vi.fn();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <SearchBar
          on_search_submit={on_search_submit}
          search_context={search_context}
        />
      </MemoryRouter>,
    );
  });

  const input = container.querySelector("input") as HTMLInputElement;

  return { input, on_search_submit };
}

function type_text(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit(path: string, value: string, search_context?: string) {
  const { input, on_search_submit } = render_bar(path, search_context);

  type_text(input, value);
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });

  return on_search_submit.mock.calls.at(-1)?.[0];
}

describe("SearchBar folder scope", () => {
  it("scopes a search from Trash to Trash", () => {
    expect(submit("/trash", "janedoe")).toBe("janedoe in:trash");
  });

  it("scopes a search from Spam to Spam", () => {
    expect(submit("/spam", "janedoe")).toBe("janedoe in:spam");
  });

  it.each([
    "/",
    "/all",
    "/starred",
    "/sent",
    "/drafts",
    "/scheduled",
    "/snoozed",
    "/archive",
    "/folder/abc",
    "/tag/abc",
  ])("searches all mail from %s", (path) => {
    expect(submit(path, "janedoe")).toBe("janedoe");
  });

  it("lets an explicit in: operator override Trash", () => {
    expect(submit("/trash", "janedoe in:all")).toBe("janedoe in:all");
    expect(submit("/trash", "janedoe in:sent")).toBe("janedoe in:sent");
  });

  it("does not rescope a query edited on the results page", () => {
    expect(submit("/trash", "janedoe", "janedoe in:trash")).toBe("janedoe");
  });

  it("previews Trash results from Trash", () => {
    vi.useFakeTimers();
    const { input } = render_bar("/trash");

    act(() => {
      input.focus();
    });
    type_text(input, "janedoe");
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(search_mock).toHaveBeenLastCalledWith("janedoe in:trash");
  });

  it("names Trash in the placeholder", () => {
    expect(render_bar("/trash").input.placeholder).toBe(
      "mail.search_in mail.trash",
    );
  });

  it.each(["/", "/sent", "/folder/abc"])(
    "promises all mail in the placeholder on %s",
    (path) => {
      expect(render_bar(path).input.placeholder).toBe(
        "mail.search_in mail.all_mail",
      );
    },
  );
});
