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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const prefs = vi.hoisted(() => ({
  confirm_before_permanent_delete: true as boolean | undefined,
  update_preference: vi.fn(),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      confirm_before_permanent_delete: prefs.confirm_before_permanent_delete,
    },
    update_preference: prefs.update_preference,
  }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import { use_permanent_delete_confirm } from "@/components/email/use_permanent_delete_confirm";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let request!: (perform: () => unknown) => void;
let root!: Root;
let host!: HTMLDivElement;

function Harness() {
  const { request_permanent_delete, permanent_delete_dialog } =
    use_permanent_delete_confirm();

  request = request_permanent_delete;

  return permanent_delete_dialog;
}

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(Harness));
  });
}

function find_button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
}

describe("permanent delete confirmation in the message viewer", () => {
  beforeEach(() => {
    prefs.confirm_before_permanent_delete = true;
    prefs.update_preference.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("asks first by default and deletes after you confirm", () => {
    const perform = vi.fn();

    render();
    act(() => request(perform));

    expect(perform).not.toHaveBeenCalled();
    expect(document.body.querySelector("#dont-ask-checkbox")).not.toBeNull();

    act(() => find_button("mail.delete_permanently")?.click());

    expect(perform).toHaveBeenCalledTimes(1);
    expect(prefs.update_preference).not.toHaveBeenCalled();
  });

  it("asks when the preference was never saved", () => {
    const perform = vi.fn();

    prefs.confirm_before_permanent_delete = undefined;
    render();
    act(() => request(perform));

    expect(perform).not.toHaveBeenCalled();
    expect(find_button("mail.delete_permanently")).toBeDefined();
  });

  it("deletes at once when the confirmation is turned off", () => {
    const perform = vi.fn();

    prefs.confirm_before_permanent_delete = false;
    render();
    act(() => request(perform));

    expect(perform).toHaveBeenCalledTimes(1);
    expect(find_button("mail.delete_permanently")).toBeUndefined();
  });

  it("saves the choice when you tick the checkbox and confirm", () => {
    const perform = vi.fn();

    render();
    act(() => request(perform));
    act(() =>
      (
        document.body.querySelector("#dont-ask-checkbox") as HTMLElement
      ).click(),
    );
    act(() => find_button("mail.delete_permanently")?.click());

    expect(perform).toHaveBeenCalledTimes(1);
    expect(prefs.update_preference).toHaveBeenCalledWith(
      "confirm_before_permanent_delete",
      false,
      true,
    );
  });

  it("keeps the setting when you tick the checkbox and cancel", () => {
    const perform = vi.fn();

    render();
    act(() => request(perform));
    act(() =>
      (
        document.body.querySelector("#dont-ask-checkbox") as HTMLElement
      ).click(),
    );
    act(() => find_button("common.cancel")?.click());

    expect(perform).not.toHaveBeenCalled();
    expect(prefs.update_preference).not.toHaveBeenCalled();
  });
});
