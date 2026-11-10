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

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const {
  WEB_SANDBOX_NOTICE_KEY,
  dismiss_web_sandbox_notice,
  fetch_web_sandbox_status,
  is_web_sandbox_notice_dismissed,
  should_show_web_sandbox_notice,
} = await import("./web_sandbox_status");

const set_tauri = (present: boolean) => {
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown };

  if (present) w.__TAURI_INTERNALS__ = {};
  else delete w.__TAURI_INTERNALS__;
};

describe("should_show_web_sandbox_notice", () => {
  it("stays hidden without a status or with the sandbox on", () => {
    expect(should_show_web_sandbox_notice(null, false)).toBe(false);
    expect(
      should_show_web_sandbox_notice(
        { enabled: true, reason: "probe_passed" },
        false,
      ),
    ).toBe(false);
  });

  it("shows when the probe turned the sandbox off", () => {
    for (const reason of [
      "probe_failed",
      "bwrap_missing",
      "bwrap_failed",
      "bwrap_timed_out",
      "startup_failures",
    ]) {
      expect(
        should_show_web_sandbox_notice({ enabled: false, reason }, false),
      ).toBe(true);
    }
  });

  it("stays hidden when the person turned the sandbox off on purpose", () => {
    for (const reason of ["forced_off", "disabled_by_environment"]) {
      expect(
        should_show_web_sandbox_notice({ enabled: false, reason }, false),
      ).toBe(false);
    }
  });

  it("stays hidden after it was dismissed", () => {
    expect(
      should_show_web_sandbox_notice(
        { enabled: false, reason: "probe_failed" },
        true,
      ),
    ).toBe(false);
  });
});

describe("web sandbox notice storage and status", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    set_tauri(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    set_tauri(false);
  });

  it("remembers the dismissal on this device", () => {
    expect(is_web_sandbox_notice_dismissed()).toBe(false);
    dismiss_web_sandbox_notice();
    expect(localStorage.getItem(WEB_SANDBOX_NOTICE_KEY)).toBe("1");
    expect(is_web_sandbox_notice_dismissed()).toBe(true);
  });

  it("treats unreadable storage as not dismissed", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(is_web_sandbox_notice_dismissed()).toBe(false);
  });

  it("does not ask for a status outside the desktop app", async () => {
    expect(await fetch_web_sandbox_status()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads the status from the desktop command", async () => {
    set_tauri(true);
    invoke.mockResolvedValue({ enabled: false, reason: "probe_failed" });

    expect(await fetch_web_sandbox_status()).toEqual({
      enabled: false,
      reason: "probe_failed",
    });
    expect(invoke).toHaveBeenCalledWith("webkit_sandbox_status");
  });

  it("returns null when the command is missing or malformed", async () => {
    set_tauri(true);
    invoke.mockRejectedValueOnce(new Error("unknown command"));
    expect(await fetch_web_sandbox_status()).toBeNull();

    invoke.mockResolvedValueOnce({ enabled: "no" });
    expect(await fetch_web_sandbox_status()).toBeNull();
  });
});
