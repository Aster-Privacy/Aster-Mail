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

const state = vi.hoisted(() => ({
  starred: [] as { id: string; is_starred: boolean }[],
}));

vi.mock("@/components/email/hooks/toggle_viewer_star", () => ({
  toggle_viewer_star: (id: string, is_starred: boolean) => {
    state.starred.push({ id, is_starred });
  },
}));

vi.mock("@/lib/i18n", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

const { use_viewer_keyboard_actions, UNLISTED_KEYBOARD_ACTION_EVENT } =
  await import("@/components/email/hooks/use_viewer_keyboard_actions");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface ProbeProps {
  enabled: boolean;
  is_starred: boolean | null;
  on_snooze?: () => void;
}

function Probe({ enabled, is_starred, on_snooze }: ProbeProps) {
  use_viewer_keyboard_actions({
    enabled,
    handles_unlisted: !enabled,
    email_id: "open",
    viewer: {
      is_read: true,
      email: is_starred === null ? null : { is_starred },
      handle_archive: () => undefined,
      handle_trash: () => undefined,
      handle_spam: () => undefined,
      handle_read_toggle: () => undefined,
    },
    request_spam: () => undefined,
    on_snooze,
  });

  return null;
}

let container: HTMLDivElement;
let root: Root;

function render(props: ProbeProps) {
  act(() => {
    root.render(<Probe {...props} />);
  });
}

function dispatch(name: string, detail: Record<string, string>) {
  const event = new CustomEvent(name, { detail });

  window.dispatchEvent(event);

  return event;
}

describe("use_viewer_keyboard_actions star and snooze", () => {
  beforeEach(() => {
    state.starred = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("stars an open email that is not in the list", () => {
    render({ enabled: false, is_starred: false });
    dispatch(UNLISTED_KEYBOARD_ACTION_EVENT, { id: "open", action: "star" });
    expect(state.starred).toEqual([{ id: "open", is_starred: false }]);
  });

  it("unstars using the current star state", () => {
    render({ enabled: false, is_starred: true });
    dispatch(UNLISTED_KEYBOARD_ACTION_EVENT, { id: "open", action: "star" });
    expect(state.starred).toEqual([{ id: "open", is_starred: true }]);
  });

  it("ignores star before the email loads", () => {
    render({ enabled: false, is_starred: null });
    dispatch(UNLISTED_KEYBOARD_ACTION_EVENT, { id: "open", action: "star" });
    expect(state.starred).toEqual([]);
  });

  it("ignores actions aimed at another email", () => {
    const on_snooze = vi.fn();

    render({ enabled: false, is_starred: false, on_snooze });
    dispatch(UNLISTED_KEYBOARD_ACTION_EVENT, { id: "other", action: "star" });
    dispatch(UNLISTED_KEYBOARD_ACTION_EVENT, {
      id: "other",
      action: "snooze",
    });
    expect(state.starred).toEqual([]);
    expect(on_snooze).not.toHaveBeenCalled();
  });

  it("opens snooze for an open email that is not in the list", () => {
    const on_snooze = vi.fn();

    render({ enabled: false, is_starred: false, on_snooze });
    dispatch(UNLISTED_KEYBOARD_ACTION_EVENT, { id: "open", action: "snooze" });
    expect(on_snooze).toHaveBeenCalledTimes(1);
  });

  it("claims star and snooze when it owns the keyboard", () => {
    const on_snooze = vi.fn();
    const list_listener = vi.fn();

    window.addEventListener("astermail:keyboard-star", list_listener);
    window.addEventListener("astermail:keyboard-snooze", list_listener);
    render({ enabled: true, is_starred: false, on_snooze });
    dispatch("astermail:keyboard-star", { id: "open" });
    dispatch("astermail:keyboard-snooze", { id: "open" });
    window.removeEventListener("astermail:keyboard-star", list_listener);
    window.removeEventListener("astermail:keyboard-snooze", list_listener);
    expect(state.starred).toEqual([{ id: "open", is_starred: false }]);
    expect(on_snooze).toHaveBeenCalledTimes(1);
    expect(list_listener).not.toHaveBeenCalled();
  });

  it("lets snooze through when the viewer cannot snooze", () => {
    const list_listener = vi.fn();

    window.addEventListener("astermail:keyboard-snooze", list_listener);
    render({ enabled: true, is_starred: false });
    dispatch("astermail:keyboard-snooze", { id: "open" });
    window.removeEventListener("astermail:keyboard-snooze", list_listener);
    expect(list_listener).toHaveBeenCalledTimes(1);
  });
});
