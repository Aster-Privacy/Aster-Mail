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
import type { NavigateFunction } from "react-router-dom";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_email_detail_shortcuts } from "@/components/email/email_detail/use_email_detail_shortcuts";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
  is_trashed?: boolean;
  is_popup?: boolean;
  is_any_modal_open?: boolean;
  confirm_before_delete?: boolean;
  confirm_before_archive?: boolean;
  has_email?: boolean;
  enabled?: boolean;
}

const spies = {
  navigate: vi.fn(),
  handle_trash: vi.fn(),
  handle_archive: vi.fn(),
  set_is_trash_confirm_open: vi.fn(),
  set_is_archive_confirm_open: vi.fn(),
  on_compose: vi.fn(),
};

function Harness({
  is_trashed = false,
  is_popup = false,
  is_any_modal_open = false,
  confirm_before_delete = false,
  confirm_before_archive = false,
  has_email = true,
  enabled = true,
}: HarnessProps) {
  use_email_detail_shortcuts({
    enabled,
    has_email,
    is_any_modal_open,
    is_trashed,
    is_popup,
    confirm_before_archive,
    confirm_before_delete,
    navigate: spies.navigate as unknown as NavigateFunction,
    handle_archive: spies.handle_archive,
    handle_trash: spies.handle_trash,
    set_is_archive_confirm_open: spies.set_is_archive_confirm_open,
    set_is_trash_confirm_open: spies.set_is_trash_confirm_open,
    on_compose: spies.on_compose,
  });

  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(props: HarnessProps = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Harness {...props} />);
  });
}

function press(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

function press_hash() {
  press({ key: "#", code: "Digit3", shiftKey: true });
}

beforeEach(() => {
  for (const spy of Object.values(spies)) spy.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("shortcuts on the full-page message view", () => {
  it("moves the message to trash on #", () => {
    mount();

    press_hash();

    expect(spies.handle_trash).toHaveBeenCalledTimes(1);
    expect(spies.set_is_trash_confirm_open).not.toHaveBeenCalled();
  });

  it("asks first on # when trash confirmation is on", () => {
    mount({ confirm_before_delete: true });

    press_hash();

    expect(spies.set_is_trash_confirm_open).toHaveBeenCalledWith(true);
    expect(spies.handle_trash).not.toHaveBeenCalled();
  });

  it("sends # in trash to the permanent delete flow", () => {
    mount({ is_trashed: true, confirm_before_delete: true });

    press_hash();

    expect(spies.handle_trash).toHaveBeenCalledTimes(1);
    expect(spies.set_is_trash_confirm_open).not.toHaveBeenCalled();
  });

  it("matches # by its key value", () => {
    mount();

    press({ key: "#" });

    expect(spies.handle_trash).toHaveBeenCalledTimes(1);
  });

  it("archives on e", () => {
    mount();

    press({ key: "e" });

    expect(spies.handle_archive).toHaveBeenCalledTimes(1);
  });

  it("returns to the list on Escape and on u", () => {
    mount();

    press({ key: "Escape" });
    press({ key: "u" });

    expect(spies.navigate).toHaveBeenCalledTimes(2);
    expect(spies.navigate).toHaveBeenCalledWith("/");
  });

  it("closes a separate message window on Escape", () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});

    mount({ is_popup: true });

    press({ key: "Escape" });

    expect(close).toHaveBeenCalledTimes(1);
    expect(spies.navigate).not.toHaveBeenCalled();
    close.mockRestore();
  });

  it("ignores shortcuts while a modal is open", () => {
    mount({ is_any_modal_open: true });

    press_hash();
    press({ key: "Escape" });

    expect(spies.handle_trash).not.toHaveBeenCalled();
    expect(spies.navigate).not.toHaveBeenCalled();
  });

  it("ignores shortcuts when they are turned off", () => {
    mount({ enabled: false });

    press_hash();
    press({ key: "Escape" });

    expect(spies.handle_trash).not.toHaveBeenCalled();
    expect(spies.navigate).not.toHaveBeenCalled();
  });

  it("ignores # before the message has loaded", () => {
    mount({ has_email: false });

    press_hash();

    expect(spies.handle_trash).not.toHaveBeenCalled();
  });
});
