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
import { describe, it, expect, vi } from "vitest";
import type { KeyboardEvent } from "react";

import { commit_on_enter, submit_on_enter } from "./commit_on_enter";

function make_event(key: string, is_composing = false) {
  const blur = vi.fn();
  const prevent_default = vi.fn();

  const event = {
    key,
    currentTarget: { blur },
    nativeEvent: { isComposing: is_composing },
    preventDefault: prevent_default,
  } as unknown as KeyboardEvent<HTMLInputElement>;

  return { event, blur, prevent_default };
}

describe("commit_on_enter", () => {
  it("blurs the input so the existing blur handler commits", () => {
    const { event, blur, prevent_default } = make_event("Enter");

    expect(commit_on_enter(event)).toBe(true);
    expect(blur).toHaveBeenCalledTimes(1);
    expect(prevent_default).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    const { event, blur } = make_event("a");

    expect(commit_on_enter(event)).toBe(false);
    expect(blur).not.toHaveBeenCalled();
  });

  it("ignores Enter while an input method editor is composing", () => {
    const { event, blur, prevent_default } = make_event("Enter", true);

    expect(commit_on_enter(event)).toBe(false);
    expect(blur).not.toHaveBeenCalled();
    expect(prevent_default).not.toHaveBeenCalled();
  });
});

describe("submit_on_enter", () => {
  it("runs the action on Enter", () => {
    const action = vi.fn();
    const { event, prevent_default } = make_event("Enter");

    submit_on_enter(action)(event);

    expect(action).toHaveBeenCalledTimes(1);
    expect(prevent_default).toHaveBeenCalledTimes(1);
  });

  it("does not run the action while composing or on other keys", () => {
    const action = vi.fn();

    submit_on_enter(action)(make_event("Enter", true).event);
    submit_on_enter(action)(make_event("Tab").event);

    expect(action).not.toHaveBeenCalled();
  });
});
