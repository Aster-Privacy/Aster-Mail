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

const get_sync_progress = vi.fn();

vi.mock("@/services/api/external_accounts", () => ({
  get_sync_progress: (...args: unknown[]) => get_sync_progress(...args),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/lib/i18n/translations", () => ({
  get_active_translations: () => ({
    common: { sync_complete: "", sync_timeout: "", sync_failed: "" },
  }),
}));

vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => false,
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_mail_changed: vi.fn(),
  emit_refresh_requested: vi.fn(),
}));

import {
  get_sync_progress_state,
  is_syncing,
  start_sync_polling,
  stop_all_sync_polling,
  stop_sync_polling,
} from "./sync_manager";

function syncing_result(processed: number) {
  return {
    data: {
      status: "syncing",
      processed_messages: processed,
      total_messages: 100,
      current_folder: "INBOX",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

describe("sync_manager polling lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    get_sync_progress.mockReset();
  });

  afterEach(() => {
    stop_all_sync_polling();
    vi.useRealTimers();
  });

  it("does not re-arm when polling is stopped during an in-flight request", async () => {
    const pending = deferred<ReturnType<typeof syncing_result>>();

    get_sync_progress.mockReturnValue(pending.promise);
    start_sync_polling("acct", "token");

    await vi.advanceTimersByTimeAsync(1500);
    expect(get_sync_progress).toHaveBeenCalledTimes(1);

    stop_sync_polling("acct");
    pending.resolve(syncing_result(10));
    await vi.advanceTimersByTimeAsync(0);

    expect(is_syncing("acct")).toBe(false);
    expect(get_sync_progress_state("acct")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(10000);
    expect(get_sync_progress).toHaveBeenCalledTimes(1);
  });

  it("lets a restarted poll own the account and ignores the older tick", async () => {
    const first = deferred<ReturnType<typeof syncing_result>>();

    get_sync_progress.mockReturnValueOnce(first.promise);
    start_sync_polling("acct", "token-1");
    await vi.advanceTimersByTimeAsync(1500);
    expect(get_sync_progress).toHaveBeenCalledWith("token-1");

    get_sync_progress.mockResolvedValue(syncing_result(50));
    start_sync_polling("acct", "token-2");

    first.resolve(syncing_result(5));
    await vi.advanceTimersByTimeAsync(0);
    expect(get_sync_progress_state("acct")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1500);
    expect(get_sync_progress).toHaveBeenLastCalledWith("token-2");
    expect(get_sync_progress_state("acct")?.processed).toBe(50);

    await vi.advanceTimersByTimeAsync(1500);
    const token_2_calls = get_sync_progress.mock.calls.filter(
      ([token]) => token === "token-2",
    );

    expect(token_2_calls.length).toBe(2);
    expect(
      get_sync_progress.mock.calls.filter(([token]) => token === "token-1")
        .length,
    ).toBe(1);
  });

  it("keeps re-arming while the sync is still running", async () => {
    get_sync_progress.mockResolvedValue(syncing_result(1));
    start_sync_polling("acct", "token");

    await vi.advanceTimersByTimeAsync(1500 * 3);
    expect(get_sync_progress).toHaveBeenCalledTimes(3);
    expect(is_syncing("acct")).toBe(true);
  });
});
