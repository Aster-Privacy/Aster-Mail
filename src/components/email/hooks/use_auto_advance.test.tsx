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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const preferences_mock = { auto_advance: "Go back to message list" };

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: preferences_mock }),
}));

const { use_auto_advance } = await import(
  "@/components/email/hooks/use_auto_advance"
);

describe("use_auto_advance", () => {
  let container: HTMLDivElement;
  let root: Root;
  let advance: () => boolean;
  const navigate_to = vi.fn();

  function Probe({
    email_ids,
    current_index,
  }: {
    email_ids: string[];
    current_index: number;
  }) {
    advance = use_auto_advance({ email_ids, current_index, navigate_to });

    return null;
  }

  const render_hook = (email_ids: string[], current_index: number) => {
    act(() => {
      root.render(
        <Probe current_index={current_index} email_ids={email_ids} />,
      );
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    navigate_to.mockClear();
    preferences_mock.auto_advance = "Go back to message list";
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does nothing when the preference is to go back to the list", () => {
    render_hook(["a", "b", "c"], 1);

    expect(advance()).toBe(false);
    expect(navigate_to).not.toHaveBeenCalled();
  });

  it("opens the next message", () => {
    preferences_mock.auto_advance = "Go to next message";
    render_hook(["a", "b", "c"], 1);

    expect(advance()).toBe(true);
    expect(navigate_to).toHaveBeenCalledWith("c");
  });

  it("opens the previous message", () => {
    preferences_mock.auto_advance = "Go to previous message";
    render_hook(["a", "b", "c"], 1);

    expect(advance()).toBe(true);
    expect(navigate_to).toHaveBeenCalledWith("a");
  });

  it("falls back to closing at the end of the list", () => {
    preferences_mock.auto_advance = "Go to next message";
    render_hook(["a", "b", "c"], 2);

    expect(advance()).toBe(false);
    expect(navigate_to).not.toHaveBeenCalled();
  });

  it("falls back to closing at the start of the list", () => {
    preferences_mock.auto_advance = "Go to previous message";
    render_hook(["a", "b", "c"], 0);

    expect(advance()).toBe(false);
    expect(navigate_to).not.toHaveBeenCalled();
  });

  it("keeps the last known position after the open message leaves the list", () => {
    preferences_mock.auto_advance = "Go to next message";
    render_hook(["a", "b", "c"], 1);
    render_hook(["a", "c"], -1);

    expect(advance()).toBe(true);
    expect(navigate_to).toHaveBeenCalledWith("c");
  });

  it("stays closed when no message is open", () => {
    preferences_mock.auto_advance = "Go to next message";
    render_hook(["a", "b", "c"], -1);

    expect(advance()).toBe(false);
    expect(navigate_to).not.toHaveBeenCalled();
  });
});
