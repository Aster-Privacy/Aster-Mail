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

vi.mock("@/services/crypto/memory_key_store", () => ({
  clear_vault_from_memory: vi.fn(),
}));

import {
  configure_session_timeout,
  start_session_timeout,
  stop_session_timeout,
} from "./session_timeout_service";

const ACCOUNT_ID = "account_1";

describe("session timeout in the desktop app", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem("astermail_session_timeout_migrated_v2", "1");
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    stop_session_timeout();
    configure_session_timeout(false, 5);
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.useRealTimers();
  });

  it("signs the account out after the configured idle period", () => {
    const on_timeout = vi.fn();

    configure_session_timeout(true, 5);
    start_session_timeout(ACCOUNT_ID, on_timeout);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    expect(on_timeout).toHaveBeenCalledTimes(1);
  });

  it("does not sign the account out while the timeout is disabled", () => {
    const on_timeout = vi.fn();

    configure_session_timeout(false, 5);
    start_session_timeout(ACCOUNT_ID, on_timeout);

    vi.advanceTimersByTime(30 * 60 * 1000);

    expect(on_timeout).not.toHaveBeenCalled();
  });
});
