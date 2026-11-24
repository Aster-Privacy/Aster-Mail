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
import type { GuardSignInState } from "@/services/guard/guard_sign_in";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuardWaitingScreen } from "@/components/guard/guard_waiting_screen";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function state(patch: Partial<GuardSignInState> = {}): GuardSignInState {
  return {
    phase: "waiting",
    number: 7,
    expires_at: "2026-11-15T10:05:00Z",
    code_error: false,
    methods: ["approve", "code", "rescue"],
    rescue_error: null,
    rescue: null,
    ...patch,
  };
}

let container: HTMLDivElement;
let root: Root;

const handlers = {
  on_submit_code: vi.fn(async () => undefined),
  on_start_rescue: vi.fn(async () => true),
  on_back: vi.fn(),
};

function render(s: GuardSignInState) {
  act(() => {
    root.render(<GuardWaitingScreen state={s} {...handlers} />);
  });
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.includes(text),
  );

  if (!found) throw new Error(`no button ${text}`);

  return found;
}

function type_into(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("GuardWaitingScreen", () => {
  it("shows the two-digit number to match", () => {
    render(state({ number: 7 }));
    expect(
      container.querySelector('[data-testid="guard_number"]')?.textContent,
    ).toBe("07");
    expect(container.textContent).toContain("guard.sign_in_match_number");
  });

  it("shows a starting note before the number exists", () => {
    render(state({ phase: "starting", number: null }));
    expect(container.querySelector('[data-testid="guard_number"]')).toBeNull();
    expect(container.textContent).toContain("guard.sign_in_starting");
  });

  it("clears the code field when the code is rejected", () => {
    render(state());
    act(() => button("guard.sign_in_use_code").click());
    const code_value = () =>
      Array.from(
        container.querySelectorAll<HTMLInputElement>("[id^=guard_code_input_]"),
      )
        .map((box) => box.value)
        .join("");

    type_into(
      container.querySelector("#guard_code_input_0") as HTMLInputElement,
      "bc-df2",
    );
    expect(code_value()).toBe("BCDF2");
    render(state({ code_error: true }));
    expect(code_value()).toBe("");
    expect(container.textContent).toContain("guard.sign_in_code_wrong");
  });

  it("opens the rescue entry from its link", () => {
    render(state());
    expect(
      container.querySelector('[data-testid="guard_rescue_entry"]'),
    ).toBeNull();
    act(() => button("guard.sign_in_use_rescue").click());
    expect(
      container.querySelector('[data-testid="guard_rescue_entry"]'),
    ).not.toBeNull();
  });

  it("shows only the rescue entry when no device can approve", () => {
    render(state({ methods: ["rescue"] }));
    expect(container.textContent).toContain("guard.sign_in_rescue_only");
    expect(container.querySelector('[data-testid="guard_number"]')).toBeNull();
  });

  it("ends when the account has no way to finish", () => {
    render(state({ methods: [] }));
    expect(container.textContent).toContain("guard.sign_in_no_method");
  });

  it("shows the paused note", () => {
    render(state({ phase: "paused" }));
    expect(container.textContent).toContain("guard.sign_in_paused");
  });

  it.each([
    ["denied", "guard.sign_in_denied"],
    ["expired", "guard.sign_in_expired"],
    ["error", "guard.sign_in_error"],
    ["on_hold", "guard.sign_in_on_hold"],
  ] as const)("ends on %s with a way back", (phase, message) => {
    render(state({ phase }));
    expect(container.textContent).toContain(message);
    expect(container.querySelector('[data-testid="guard_number"]')).toBeNull();
    act(() =>
      (
        container.querySelector(
          '[data-testid="guard_sign_in_again"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(handlers.on_back).toHaveBeenCalledTimes(1);
  });

  it("offers to sign in again after the request ends", () => {
    render(state({ phase: "expired" }));
    expect(container.textContent).toContain("guard.sign_in_again");
  });

  it("says when a paused request continues", () => {
    render(state({ phase: "paused", retry_at: "2026-11-18T10:00:00Z" }));
    expect(container.textContent).toContain("guard.sign_in_paused_until");
  });

  it("says when sign-in prompts resume on the account", () => {
    render(
      state({
        phase: "on_hold",
        error_code: "GUARD_PAUSED",
        retry_at: "2026-11-18T10:00:00Z",
      }),
    );
    expect(container.textContent).toContain("guard.sign_in_on_hold_until");
  });

  it("explains an outdated app instead of a generic error", () => {
    render(state({ phase: "error", error_code: "CLIENT_UPGRADE_REQUIRED" }));
    expect(container.textContent).toContain("guard.error_upgrade");
  });

  it("says where to approve the request", () => {
    render(state({ phase: "waiting", number: 42 }));
    expect(container.textContent).toContain("guard.sign_in_where_to_approve");
  });

  it("shows when a started rescue finishes", () => {
    render(
      state({
        phase: "rescue",
        rescue: { rescue_id: "r1", apply_after: "2026-11-18T10:00:00Z" },
      }),
    );
    expect(container.textContent).toContain("guard.sign_in_rescue_started:");
    expect(container.querySelector('[data-testid="guard_number"]')).toBeNull();
  });
});
