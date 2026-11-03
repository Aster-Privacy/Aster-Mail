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
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const verify_identity = vi.fn();
let expected_user_id: string | null = null;

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    verify_identity: (...args: unknown[]) => verify_identity(...args),
    get_expected_user_id: () => expected_user_id,
  },
}));

import {
  confirm_calendar_identity,
  reset_calendar_identity,
} from "./identity_guard";

beforeEach(() => {
  get.mockReset();
  verify_identity.mockReset();
  verify_identity.mockResolvedValue(false);
  expected_user_id = null;
  reset_calendar_identity();
});

describe("confirm_calendar_identity", () => {
  it("confirms when the server session belongs to the local account", async () => {
    get.mockResolvedValue({ data: { user_id: "user-a" } });

    await expect(confirm_calendar_identity("user-a")).resolves.toBe(true);
    expect(String(get.mock.calls[0][0])).toBe("/core/v1/auth/me");
  });

  it("refuses when the server session belongs to another account", async () => {
    get.mockResolvedValue({ data: { user_id: "user-b" } });

    await expect(confirm_calendar_identity("user-a")).resolves.toBe(false);
    expect(verify_identity).toHaveBeenCalledWith(true);
  });

  it("refuses without a network call when the client expects another user", async () => {
    expected_user_id = "user-b";

    await expect(confirm_calendar_identity("user-a")).resolves.toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("refuses the anonymous placeholder account", async () => {
    await expect(confirm_calendar_identity("anonymous")).resolves.toBe(false);
    await expect(confirm_calendar_identity("")).resolves.toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("refuses when the server cannot confirm who is signed in", async () => {
    get.mockResolvedValueOnce({ error: "offline", code: "NETWORK_ERROR" });
    await expect(confirm_calendar_identity("user-a")).resolves.toBe(false);

    get.mockRejectedValueOnce(new Error("boom"));
    await expect(confirm_calendar_identity("user-a")).resolves.toBe(false);
  });

  it("caches a confirmation for the same account only", async () => {
    get.mockResolvedValue({ data: { user_id: "user-a" } });

    await confirm_calendar_identity("user-a");
    await confirm_calendar_identity("user-a");
    expect(get).toHaveBeenCalledTimes(1);

    get.mockResolvedValue({ data: { user_id: "user-a" } });
    await expect(confirm_calendar_identity("user-b")).resolves.toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent checks", async () => {
    let release: (value: unknown) => void = () => undefined;

    get.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const first = confirm_calendar_identity("user-a");
    const second = confirm_calendar_identity("user-a");

    release({ data: { user_id: "user-a" } });
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("drops an answer that arrives after an account switch", async () => {
    let release: (value: unknown) => void = () => undefined;

    get.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const stale = confirm_calendar_identity("user-a");

    reset_calendar_identity();
    release({ data: { user_id: "user-a" } });
    await expect(stale).resolves.toBe(false);

    get.mockResolvedValueOnce({ data: { user_id: "user-a" } });
    await expect(confirm_calendar_identity("user-a")).resolves.toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("checks again once the cached confirmation expires", async () => {
    vi.useFakeTimers();
    try {
      get.mockResolvedValue({ data: { user_id: "user-a" } });
      await confirm_calendar_identity("user-a");
      vi.advanceTimersByTime(31_000);
      await confirm_calendar_identity("user-a");
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
