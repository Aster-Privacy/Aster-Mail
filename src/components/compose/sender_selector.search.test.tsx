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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

import { SenderSelector } from "@/components/compose/sender_selector";

Element.prototype.scrollIntoView = () => {};

function make_options(alias_count: number): SenderOption[] {
  const options: SenderOption[] = [
    {
      id: "primary",
      email: "user@astermail.org",
      display_name: "Primary User",
      type: "primary",
      is_enabled: true,
    },
  ];

  for (let i = 0; i < alias_count; i++) {
    options.push({
      id: `alias-${i}`,
      email: `alias${i}@astermail.org`,
      display_name: i === 0 ? "Marketing Contact" : undefined,
      type: "alias",
      is_enabled: true,
    });
  }

  return options;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render_selector(
  options: SenderOption[],
  on_select: (option: SenderOption) => void = () => {},
) {
  act(() => {
    root.render(
      <SenderSelector
        on_select={on_select}
        options={options}
        selected={options[0]}
      />,
    );
  });
}

function open_dropdown() {
  const trigger = container.querySelector("button");

  act(() => {
    trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function get_search_input(): HTMLInputElement | null {
  return container.querySelector("input[type=text]");
}

function type_query(input: HTMLInputElement, value: string) {
  const set_value = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    set_value.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press_key(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

function visible_emails(): string[] {
  return Array.from(container.querySelectorAll("p.text-sm.truncate")).map(
    (el) => el.textContent ?? "",
  );
}

describe("SenderSelector search", () => {
  it("shows the search input for large option lists", () => {
    render_selector(make_options(20));
    open_dropdown();

    expect(get_search_input()).not.toBeNull();
  });

  it("hides the search input for small option lists", () => {
    render_selector(make_options(3));
    open_dropdown();

    expect(get_search_input()).toBeNull();
  });

  it("filters options by email as the user types", () => {
    render_selector(make_options(20));
    open_dropdown();

    expect(visible_emails()).toHaveLength(21);

    type_query(get_search_input()!, "alias1");

    const emails = visible_emails();

    expect(emails).toHaveLength(11);
    expect(emails).toContain("alias1@astermail.org");
    expect(emails).toContain("alias19@astermail.org");
    expect(emails).not.toContain("alias2@astermail.org");
  });

  it("filters options by display name", () => {
    render_selector(make_options(20));
    open_dropdown();

    type_query(get_search_input()!, "marketing");

    expect(visible_emails()).toEqual(["alias0@astermail.org"]);
  });

  it("shows an empty state when nothing matches", () => {
    render_selector(make_options(20));
    open_dropdown();

    type_query(get_search_input()!, "zzz-no-match");

    expect(visible_emails()).toHaveLength(0);
    expect(container.textContent).toContain("common.no_results");
  });

  it("selects the first match on enter", () => {
    const on_select = vi.fn();

    render_selector(make_options(20), on_select);
    open_dropdown();

    type_query(get_search_input()!, "alias15");
    press_key(get_search_input()!, "Enter");

    expect(on_select).toHaveBeenCalledTimes(1);
    expect(on_select.mock.calls[0][0].email).toBe("alias15@astermail.org");
  });

  it("does not select anything on enter with an empty query", () => {
    const on_select = vi.fn();

    render_selector(make_options(20), on_select);
    open_dropdown();

    press_key(get_search_input()!, "Enter");

    expect(on_select).not.toHaveBeenCalled();
  });

  it("moves the highlight with arrow keys and selects on enter", () => {
    const on_select = vi.fn();

    render_selector(make_options(20), on_select);
    open_dropdown();

    const input = get_search_input()!;

    press_key(input, "ArrowDown");
    press_key(input, "ArrowDown");
    press_key(input, "Enter");

    expect(on_select).toHaveBeenCalledTimes(1);
    expect(on_select.mock.calls[0][0].email).toBe("alias0@astermail.org");
  });

  it("selects an option on click from filtered results", () => {
    const on_select = vi.fn();

    render_selector(make_options(20), on_select);
    open_dropdown();

    type_query(get_search_input()!, "alias7");

    const option_button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("alias7@astermail.org"),
    );

    act(() => {
      option_button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(on_select).toHaveBeenCalledTimes(1);
    expect(on_select.mock.calls[0][0].email).toBe("alias7@astermail.org");
  });
});
