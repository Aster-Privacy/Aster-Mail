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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => `pt:${key}`, language: "pt" }),
}));

vi.mock("@/hooks/use_search/use_search_hook", () => ({
  use_search: () => ({
    state: {
      results: [],
      is_loading: false,
      is_searching: false,
      has_more: false,
      total_results: 0,
      search_time_ms: 0,
      error: null,
    },
    search: () => {},
    clear_results: () => {},
    load_more: () => {},
  }),
}));

const { use_advanced_search } = await import("./use_advanced_search");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

function QuickFilterLabels() {
  const { quick_filters } = use_advanced_search();

  return (
    <ul>
      {quick_filters.map((filter) => (
        <li key={filter.id} data-id={filter.id} data-operator={filter.operator}>
          {filter.label}
        </li>
      ))}
    </ul>
  );
}

describe("use_advanced_search quick filters", () => {
  it("labels the quick filters in the user's language", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(<QuickFilterLabels />);
    });

    const labels = [...container.querySelectorAll("li")].map(
      (li) => li.textContent,
    );

    expect(labels).toEqual([
      "pt:mail.filter_unread",
      "pt:mail.filter_starred",
      "pt:mail.filter_has_attachment",
    ]);

    const items = [...container.querySelectorAll("li")];

    expect(items.map((li) => li.dataset.id)).toEqual([
      "unread",
      "starred",
      "attachment",
    ]);
    expect(items.map((li) => li.dataset.operator)).toEqual([
      "is:unread",
      "is:starred",
      "has:attachment",
    ]);
  });
});
