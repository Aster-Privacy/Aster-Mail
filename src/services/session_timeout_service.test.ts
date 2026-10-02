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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({ cleared: 0 }));

vi.mock("@/services/crypto/memory_key_store", () => ({
  clear_vault_from_memory: () => {
    h.cleared += 1;
  },
}));

import {
  check_session_expired,
  start_session_timeout,
  stop_session_timeout,
} from "@/services/session_timeout_service";

const ACCOUNT = "acct-1";
const ACTIVITY_KEY = `astermail_last_activity_${ACCOUNT}`;
const MINUTE = 60 * 1000;

function enable_timeout(minutes: number): void {
  localStorage.setItem(
    "astermail_session_timeout_config",
    JSON.stringify({ enabled: true, timeout_minutes: minutes }),
  );
  localStorage.setItem("astermail_session_timeout_migrated_v2", "1");
}

describe("session timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    localStorage.clear();
    h.cleared = 0;
  });

  afterEach(() => {
    stop_session_timeout();
    vi.useRealTimers();
  });

  it("reads the saved setting before anything has started", () => {
    enable_timeout(5);
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - 6 * MINUTE));

    expect(check_session_expired(ACCOUNT)).toBe(true);
  });

  it("does not report expiry while the saved activity is recent", () => {
    enable_timeout(5);
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - 2 * MINUTE));

    expect(check_session_expired(ACCOUNT)).toBe(false);
  });

  it("locks at once when a restored session is already past its limit", () => {
    enable_timeout(5);
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - 6 * MINUTE));
    const on_timeout = vi.fn();

    start_session_timeout(ACCOUNT, on_timeout, { resume: true });

    expect(on_timeout).toHaveBeenCalledTimes(1);
    expect(h.cleared).toBe(1);
  });

  it("keeps the saved activity time when a session is restored", () => {
    enable_timeout(5);
    const last = Date.now() - 3 * MINUTE;

    localStorage.setItem(ACTIVITY_KEY, String(last));
    const on_timeout = vi.fn();

    start_session_timeout(ACCOUNT, on_timeout, { resume: true });

    expect(localStorage.getItem(ACTIVITY_KEY)).toBe(String(last));
    vi.advanceTimersByTime(2 * MINUTE - 1000);
    expect(on_timeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(on_timeout).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh clock after a new sign-in", () => {
    enable_timeout(5);
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - 6 * MINUTE));
    const on_timeout = vi.fn();

    start_session_timeout(ACCOUNT, on_timeout);

    expect(on_timeout).not.toHaveBeenCalled();
    expect(localStorage.getItem(ACTIVITY_KEY)).toBe(String(Date.now()));
  });

  it("times out an idle tab and resets on user input", () => {
    enable_timeout(5);
    const on_timeout = vi.fn();

    start_session_timeout(ACCOUNT, on_timeout);
    vi.advanceTimersByTime(4 * MINUTE);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(4 * MINUTE);
    expect(on_timeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * MINUTE);
    expect(on_timeout).toHaveBeenCalledTimes(1);
  });
});
