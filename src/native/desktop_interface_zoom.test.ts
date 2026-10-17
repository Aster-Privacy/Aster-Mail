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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INTERFACE_ZOOM_EVENT,
  get_interface_zoom,
  next_interface_zoom,
  normalize_interface_zoom,
  set_interface_zoom,
  step_interface_zoom,
  zoom_direction_for_key,
} from "@/native/desktop_interface_zoom";

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

function key(
  values: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
    >
  >,
) {
  return {
    key: "",
    code: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...values,
  };
}

describe("interface zoom steps", () => {
  it("clamps and rounds values", () => {
    expect(normalize_interface_zoom(1)).toBe(1);
    expect(normalize_interface_zoom(0.2)).toBe(0.8);
    expect(normalize_interface_zoom(5)).toBe(2);
    expect(normalize_interface_zoom(1.254)).toBe(1.25);
    expect(normalize_interface_zoom(Number.NaN)).toBe(1);
  });

  it("moves between the preset steps", () => {
    expect(next_interface_zoom(1, "in")).toBe(1.1);
    expect(next_interface_zoom(1.1, "in")).toBe(1.25);
    expect(next_interface_zoom(2, "in")).toBe(2);
    expect(next_interface_zoom(1, "out")).toBe(0.9);
    expect(next_interface_zoom(0.8, "out")).toBe(0.8);
    expect(next_interface_zoom(1.3, "out")).toBe(1.25);
    expect(next_interface_zoom(1.75, "reset")).toBe(1);
  });
});

describe("interface zoom shortcuts", () => {
  it("maps Control shortcuts on Windows and Linux", () => {
    expect(
      zoom_direction_for_key(key({ key: "=", ctrlKey: true }), false),
    ).toBe("in");
    expect(
      zoom_direction_for_key(
        key({ key: "+", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe("in");
    expect(
      zoom_direction_for_key(
        key({ key: "+", code: "NumpadAdd", ctrlKey: true }),
        false,
      ),
    ).toBe("in");
    expect(
      zoom_direction_for_key(key({ key: "-", ctrlKey: true }), false),
    ).toBe("out");
    expect(
      zoom_direction_for_key(key({ key: "0", ctrlKey: true }), false),
    ).toBe("reset");
  });

  it("maps Command shortcuts on macOS", () => {
    expect(zoom_direction_for_key(key({ key: "=", metaKey: true }), true)).toBe(
      "in",
    );
    expect(zoom_direction_for_key(key({ key: "=", ctrlKey: true }), true)).toBe(
      null,
    );
  });

  it("ignores other key combinations", () => {
    expect(zoom_direction_for_key(key({ key: "=" }), false)).toBe(null);
    expect(
      zoom_direction_for_key(
        key({ key: "=", ctrlKey: true, altKey: true }),
        false,
      ),
    ).toBe(null);
    expect(
      zoom_direction_for_key(
        key({ key: ")", code: "Digit0", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(null);
    expect(
      zoom_direction_for_key(key({ key: "b", ctrlKey: true }), false),
    ).toBe(null);
  });
});

describe("interface zoom commands", () => {
  beforeEach(() => {
    invoke_mock.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("reads the saved size", async () => {
    invoke_mock.mockResolvedValue(1.5);

    expect(await get_interface_zoom()).toBe(1.5);
    expect(invoke_mock).toHaveBeenCalledWith("get_interface_zoom");
  });

  it("applies a size and tells listeners", async () => {
    invoke_mock.mockImplementation(
      async (_command: string, args?: { zoom: number }) => args?.zoom ?? 1,
    );
    const listener = vi.fn();

    window.addEventListener(INTERFACE_ZOOM_EVENT, listener);
    expect(await set_interface_zoom(1.25)).toBe(1.25);
    expect(invoke_mock).toHaveBeenCalledWith("set_interface_zoom", {
      zoom: 1.25,
    });
    expect((listener.mock.calls[0][0] as CustomEvent<number>).detail).toBe(
      1.25,
    );
    expect(await step_interface_zoom("in")).toBe(1.5);
    window.removeEventListener(INTERFACE_ZOOM_EVENT, listener);
  });

  it("does nothing outside the desktop app", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

    expect(await get_interface_zoom()).toBe(1);
    expect(invoke_mock).not.toHaveBeenCalled();
  });
});
