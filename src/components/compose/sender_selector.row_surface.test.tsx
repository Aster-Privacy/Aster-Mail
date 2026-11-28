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
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

const MOTION_ONLY_PROPS = vi.hoisted(
  () =>
    new Set([
      "initial",
      "animate",
      "exit",
      "transition",
      "variants",
      "layout",
      "layoutId",
      "whileHover",
      "whileTap",
      "whileFocus",
      "whileDrag",
      "whileInView",
      "viewport",
      "drag",
      "dragConstraints",
      "onAnimationStart",
      "onAnimationComplete",
    ]),
);

vi.mock("framer-motion", async () => {
  const { forwardRef } = await import("react");
  const cache = new Map<string, unknown>();

  return {
    motion: new Proxy(
      {},
      {
        get: (_target, key: string) => {
          if (!cache.has(key)) {
            cache.set(
              key,
              forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
                ({ children, ...rest }, ref) => (
                  <div
                    ref={ref}
                    {...Object.fromEntries(
                      Object.entries(rest).filter(
                        ([prop]) => !MOTION_ONLY_PROPS.has(prop),
                      ),
                    )}
                  >
                    {children}
                  </div>
                ),
              ),
            );
          }

          return cache.get(key);
        },
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

import { SenderSelector } from "@/components/compose/sender_selector";
import { find_press_target } from "@/lib/press_feedback";

Element.prototype.scrollIntoView = () => {};

const NESTED_FILL_PATTERN =
  /(^|\s)((hover|active|focus|focus-visible|group-hover):bg-\S+|search_icon_btn|aster_btn\S*)(\s|$)/;

const OPTIONS: SenderOption[] = [
  {
    id: "primary",
    email: "user@astermail.org",
    display_name: "Primary User",
    type: "primary",
    is_enabled: true,
  },
  {
    id: "alias-1",
    email: "a.very.long.alias.address.that.would.truncate@astermail.org",
    type: "alias",
    is_enabled: true,
  },
  {
    id: "alias-off",
    email: "paused@astermail.org",
    type: "alias",
    is_enabled: true,
    sending_disabled: true,
  },
];

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

function open_selector() {
  const on_set_preferred = vi.fn();
  const on_select = vi.fn();

  act(() => {
    root.render(
      <SenderSelector
        on_select={on_select}
        on_set_preferred={on_set_preferred}
        options={OPTIONS}
        preferred_id="alias-1"
        selected={OPTIONS[0]}
      />,
    );
  });
  act(() => {
    container
      .querySelector("button")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  return { on_set_preferred, on_select };
}

function rows(): HTMLElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>(".aster_menu_row"),
  );
}

describe("sender selector rows", () => {
  it("renders each option as one row surface with no nested filled boxes", () => {
    open_selector();
    const all = rows();

    expect(all.length).toBe(OPTIONS.length);
    for (const row of all) {
      expect(row.hasAttribute("data-ripple-row")).toBe(true);
      expect(row.querySelectorAll("[data-row-primary]").length).toBe(1);
      expect(
        row.querySelectorAll("[data-ripple-row], [data-ripple]").length,
      ).toBe(0);
      for (const el of Array.from(row.querySelectorAll("*"))) {
        expect(el.getAttribute("class") ?? "").not.toMatch(NESTED_FILL_PATTERN);
      }
    }
  });

  it("sends the ripple to the whole row and never to the pin", () => {
    open_selector();
    const row = rows()[1];
    const main = row.querySelector("[data-row-primary]")!;
    const label = main.querySelector("span span span")!;
    const pin = row.querySelector(".aster_menu_row_action")!;

    expect(find_press_target(main)).toBe(row);
    expect(find_press_target(label)).toBe(row);
    expect(find_press_target(row)).toBe(row);
    expect(find_press_target(pin)).toBeNull();
    expect(find_press_target(pin.firstElementChild)).toBeNull();
  });

  it("keeps the pin inside the row as a keyboard-reachable icon action", () => {
    const { on_set_preferred, on_select } = open_selector();
    const row = rows()[1];
    const pin = row.querySelector<HTMLButtonElement>(".aster_menu_row_action")!;

    expect(pin.tagName).toBe("BUTTON");
    expect(pin.getAttribute("type")).toBe("button");
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(pin.getAttribute("aria-label")).toBeTruthy();
    expect(pin.tabIndex).toBe(0);
    act(() => {
      pin.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(on_set_preferred).toHaveBeenCalledWith(null);
    expect(on_select).not.toHaveBeenCalled();
  });

  it("shows a sending-disabled row unpressable with its status under the address", () => {
    open_selector();
    const row = rows()[2];
    const main = row.querySelector<HTMLElement>("[data-row-primary]")!;
    const spans = Array.from(row.querySelectorAll("span"));
    const address = spans.find(
      (el) => el.textContent === "paused@astermail.org",
    )!;
    const badge = row.querySelector("[data-sending-disabled-badge]")!;

    expect(row.hasAttribute("data-disabled")).toBe(true);
    expect(main.getAttribute("aria-disabled")).toBe("true");
    expect(address).toBeDefined();
    expect(badge).not.toBeNull();
    expect(address.parentElement!.contains(badge)).toBe(false);
    expect(find_press_target(main)).toBeNull();
    expect(find_press_target(row)).toBeNull();
  });
});
