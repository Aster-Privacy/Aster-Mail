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
    },
    search: search_mock,
    clear_results: vi.fn(),
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

function button_with_text(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );

  if (!match) throw new Error(`no button with ${text}`);

  return match;
}

describe("MobileSearchPage folder scope", () => {
  it("scopes a search opened from Trash to Trash", () => {
    const input = render_page("trash");

    expect(input.placeholder).toBe("mail.search_in mail.trash");
    submit(input, "janedoe");

    expect(search_mock).toHaveBeenLastCalledWith("janedoe in:trash");
    expect(input.value).toBe("janedoe in:trash");
  });

  it("widens a Trash search to everywhere and back", () => {
    const input = render_page("trash");

    submit(input, "janedoe");
    act(() => {
      button_with_text("mail.search_scope_anywhere").click();
    });
    expect(search_mock).toHaveBeenLastCalledWith("janedoe in:anywhere");

    act(() => {
      button_with_text("mail.filter_in").click();
    });
    expect(search_mock).toHaveBeenLastCalledWith("janedoe in:trash");
  });

  it("searches all mail from Inbox and narrows from the chip", () => {
    const input = render_page("inbox");

    expect(input.placeholder).toBe("mail.search_in mail.all_mail");
    submit(input, "janedoe");
    expect(search_mock).toHaveBeenLastCalledWith("janedoe");

    act(() => {
      button_with_text("mail.filter_in").click();
    });
    expect(search_mock).toHaveBeenLastCalledWith("janedoe in:inbox");
  });

  it("lets an explicit in: operator override Trash", () => {
    const input = render_page("trash");

    submit(input, "janedoe in:all");
    expect(search_mock).toHaveBeenLastCalledWith("janedoe in:all");
  });

  it("keeps searches from custom folders unscoped", () => {
    submit(render_page("folder-abc"), "janedoe");
    expect(search_mock).toHaveBeenLastCalledWith("janedoe");
  });
});
