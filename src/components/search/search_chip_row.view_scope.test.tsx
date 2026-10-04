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
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { SearchChipRow } = await import("./search_chip_row");

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
  document.body.innerHTML = "";
  root = null;
  container = null;
});

function button_with_text(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );

  if (!match) throw new Error(`no button with ${text}`);

  return match;
}

function render_row(query: string, scope_view?: string) {
  const on_query_change = vi.fn();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <SearchChipRow
        on_advanced_click={() => {}}
        on_query_change={on_query_change}
        query={query}
        scope_view={scope_view}
      />,
    );
  });

  return on_query_change;
}

describe("SearchChipRow folder scope chips", () => {
  it("widens a Trash search to everywhere", () => {
    const on_query_change = render_row("janedoe in:trash", "trash");

    act(() => {
      button_with_text("mail.search_scope_anywhere").click();
    });

    expect(on_query_change).toHaveBeenCalledWith("janedoe in:anywhere");
  });

  it("returns an everywhere search to Trash", () => {
    const on_query_change = render_row("janedoe in:anywhere", "trash");

    act(() => {
      button_with_text("mail.filter_in").click();
    });

    expect(on_query_change).toHaveBeenCalledWith("janedoe in:trash");
  });

  it("narrows an all mail search started from Inbox to Inbox", () => {
    const on_query_change = render_row("janedoe", "inbox");

    act(() => {
      button_with_text("mail.filter_in").click();
    });

    expect(on_query_change).toHaveBeenCalledWith("janedoe in:inbox");
  });

  it("widens an Inbox search back to all mail", () => {
    const on_query_change = render_row("janedoe in:inbox", "inbox");

    act(() => {
      button_with_text("mail.all_mail").click();
    });

    expect(on_query_change).toHaveBeenCalledWith("janedoe");
  });

  it("hides the scope chips for All Mail", () => {
    render_row("janedoe", "all");
    expect(document.body.textContent).not.toContain("mail.filter_in");
  });

  it("hides the scope chips when the query names another folder", () => {
    render_row("janedoe in:sent", "trash");
    expect(document.body.textContent).not.toContain("mail.filter_in");
  });
});
