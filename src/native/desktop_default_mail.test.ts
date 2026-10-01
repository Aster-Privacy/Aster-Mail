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
  get_default_mail_status,
  set_default_mail_app,
} from "@/native/desktop_default_mail";

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

function mark_desktop(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
}

describe("desktop default mail", () => {
  beforeEach(() => {
    invoke_mock.mockReset();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("reports unsupported outside the desktop app without calling native code", async () => {
    expect(await get_default_mail_status()).toEqual({
      supported: false,
      is_default: false,
    });
    expect(await set_default_mail_app(true)).toBe("failed");
    expect(invoke_mock).not.toHaveBeenCalled();
  });

  it("returns the native status", async () => {
    mark_desktop();
    invoke_mock.mockResolvedValue({ supported: true, is_default: true });

    expect(await get_default_mail_status()).toEqual({
      supported: true,
      is_default: true,
    });
    expect(invoke_mock).toHaveBeenCalledWith("default_mail_app_status");
  });

  it("falls back to unsupported when the status call fails", async () => {
    mark_desktop();
    invoke_mock.mockRejectedValue(new Error("unavailable"));

    expect(await get_default_mail_status()).toEqual({
      supported: false,
      is_default: false,
    });
  });

  it("calls the set command when turning the setting on", async () => {
    mark_desktop();
    invoke_mock.mockResolvedValue("applied");

    expect(await set_default_mail_app(true)).toBe("applied");
    expect(invoke_mock).toHaveBeenCalledWith("set_default_mail_app");
  });

  it("calls the clear command when turning the setting off", async () => {
    mark_desktop();
    invoke_mock.mockResolvedValue("needs_confirmation");

    expect(await set_default_mail_app(false)).toBe("needs_confirmation");
    expect(invoke_mock).toHaveBeenCalledWith("clear_default_mail_app");
  });

  it("reports a failure when the native command rejects", async () => {
    mark_desktop();
    invoke_mock.mockRejectedValue("registry write failed");

    expect(await set_default_mail_app(true)).toBe("failed");
  });
});
