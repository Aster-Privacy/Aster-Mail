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

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

type tray_module = typeof import("@/native/tauri_tray");

function mark_desktop(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
}

function respond_as(supported: boolean, set_fails = false): void {
  invoke_mock.mockImplementation((command: string) => {
    if (command === "hide_dock_on_close_supported") {
      return Promise.resolve(supported);
    }
    if (command === "set_hide_dock_on_close" && set_fails) {
      return Promise.reject(new Error("unsupported"));
    }

    return Promise.resolve(undefined);
  });
}

function set_calls(): unknown[] {
  return invoke_mock.mock.calls
    .filter(([command]) => command === "set_hide_dock_on_close")
    .map(([, args]) => (args as { enabled: boolean }).enabled);
}

async function load(): Promise<tray_module> {
  vi.resetModules();

  return import("@/native/tauri_tray");
}

describe("hide from the Dock on close", () => {
  beforeEach(() => {
    invoke_mock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    localStorage.clear();
  });

  it("is off until the person turns it on", async () => {
    const tray = await load();

    expect(tray.get_hide_dock_on_close()).toBe(false);
  });

  it("is unsupported and never calls native code in a browser", async () => {
    respond_as(true);
    const tray = await load();

    expect(await tray.is_hide_dock_on_close_supported()).toBe(false);
    expect(await tray.set_hide_dock_on_close(true)).toBe(false);
    await tray.sync_hide_dock_on_close();

    expect(invoke_mock).not.toHaveBeenCalled();
    expect(tray.get_hide_dock_on_close()).toBe(false);
  });

  it("does nothing on desktop builds that are not macOS", async () => {
    mark_desktop();
    respond_as(false);
    const tray = await load();

    expect(await tray.set_hide_dock_on_close(true)).toBe(false);
    await tray.sync_hide_dock_on_close();

    expect(set_calls()).toEqual([]);
    expect(tray.get_hide_dock_on_close()).toBe(false);
  });

  it("stores and applies the choice on macOS", async () => {
    mark_desktop();
    respond_as(true);
    const tray = await load();

    expect(await tray.set_hide_dock_on_close(true)).toBe(true);
    expect(tray.get_hide_dock_on_close()).toBe(true);
    expect(await tray.set_hide_dock_on_close(false)).toBe(true);
    expect(tray.get_hide_dock_on_close()).toBe(false);
    expect(set_calls()).toEqual([true, false]);
  });

  it("restores the saved choice at startup", async () => {
    mark_desktop();
    respond_as(true);
    localStorage.setItem("aster_hide_dock_on_close", "true");
    const tray = await load();

    await tray.sync_hide_dock_on_close();

    expect(set_calls()).toEqual([true]);
  });

  it("keeps the previous choice when native code refuses it", async () => {
    mark_desktop();
    respond_as(true, true);
    const tray = await load();

    expect(await tray.set_hide_dock_on_close(true)).toBe(false);
    expect(tray.get_hide_dock_on_close()).toBe(false);
  });

  it("asks native code for support only once", async () => {
    mark_desktop();
    respond_as(true);
    const tray = await load();

    await tray.is_hide_dock_on_close_supported();
    await tray.set_hide_dock_on_close(true);
    await tray.sync_hide_dock_on_close();

    const support_calls = invoke_mock.mock.calls.filter(
      ([command]) => command === "hide_dock_on_close_supported",
    );

    expect(support_calls).toHaveLength(1);
  });
});
