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

type launch_module = typeof import("@/native/tauri_launch_at_login");

function mark_desktop(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
}

async function load(): Promise<launch_module> {
  vi.resetModules();

  return import("@/native/tauri_launch_at_login");
}

describe("launch at login", () => {
  beforeEach(() => {
    invoke_mock.mockReset();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("is unsupported and never calls native code in a browser", async () => {
    const launch = await load();

    expect(await launch.get_launch_at_login_status()).toEqual({
      supported: false,
      enabled: false,
      start_minimized: false,
      needs_install: false,
    });
    expect(await launch.set_launch_at_login(true, "reason")).toBeNull();
    expect(await launch.set_start_minimized(true)).toBeNull();
    expect(invoke_mock).not.toHaveBeenCalled();
  });

  it("reads the native status on desktop", async () => {
    mark_desktop();
    invoke_mock.mockResolvedValue({
      enabled: true,
      start_minimized: false,
      needs_install: false,
    });
    const launch = await load();

    expect(await launch.get_launch_at_login_status()).toEqual({
      supported: true,
      enabled: true,
      start_minimized: false,
      needs_install: false,
    });
    expect(invoke_mock).toHaveBeenCalledWith("launch_at_login_status");
  });

  it("treats a malformed native reply as unsupported", async () => {
    mark_desktop();
    invoke_mock.mockResolvedValue({ enabled: "yes" });
    const launch = await load();

    expect((await launch.get_launch_at_login_status()).supported).toBe(false);
  });

  it("passes the toggle and reason to native code", async () => {
    mark_desktop();
    invoke_mock.mockResolvedValue({
      enabled: true,
      start_minimized: true,
      needs_install: false,
    });
    const launch = await load();

    const status = await launch.set_launch_at_login(true, "Open at sign in.");

    expect(invoke_mock).toHaveBeenCalledWith("set_launch_at_login", {
      enabled: true,
      reason: "Open at sign in.",
    });
    expect(status?.enabled).toBe(true);
  });

  it("returns null when native code refuses the change", async () => {
    mark_desktop();
    invoke_mock.mockRejectedValue(new Error("denied"));
    const launch = await load();

    expect(await launch.set_launch_at_login(true, "reason")).toBeNull();
    expect(await launch.set_start_minimized(false)).toBeNull();
  });

  it("saves the start minimized choice", async () => {
    mark_desktop();
    invoke_mock.mockResolvedValue({
      enabled: true,
      start_minimized: true,
      needs_install: false,
    });
    const launch = await load();

    const status = await launch.set_start_minimized(true);

    expect(invoke_mock).toHaveBeenCalledWith("set_start_minimized", {
      enabled: true,
    });
    expect(status?.start_minimized).toBe(true);
  });
});
