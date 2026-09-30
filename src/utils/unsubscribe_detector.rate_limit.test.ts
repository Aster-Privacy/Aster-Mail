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

vi.mock("@/services/api/subscriptions", () => ({
  proxy_unsubscribe: vi.fn(),
}));

import { proxy_unsubscribe } from "@/services/api/subscriptions";
import { execute_unsubscribe } from "@/utils/unsubscribe_detector";

const mock_proxy = vi.mocked(proxy_unsubscribe);

const ONE_CLICK_INFO = {
  has_unsubscribe: true,
  method: "one-click" as const,
  unsubscribe_link: "https://sender.example.com/oc?t=abc",
  list_unsubscribe_post: "List-Unsubscribe=One-Click",
};

const RATE_LIMITED = {
  error: "rate limited",
  code: "RATE_LIMIT_EXCEEDED" as const,
  retry_after_secs: 30,
};

describe("bulk unsubscribe survives the proxy rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mock_proxy.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits out a rate limit and reports the retried sender as unsubscribed", async () => {
    mock_proxy
      .mockResolvedValueOnce(RATE_LIMITED)
      .mockResolvedValueOnce({ data: { success: true, method: "one-click" } });

    const pending = execute_unsubscribe(ONE_CLICK_INFO, {
      retry_on_rate_limit: true,
    });

    await vi.advanceTimersByTimeAsync(30_000);

    await expect(pending).resolves.toBe("api");
    expect(mock_proxy).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the caller has not opted in", async () => {
    mock_proxy.mockResolvedValue(RATE_LIMITED);

    await expect(execute_unsubscribe(ONE_CLICK_INFO)).resolves.toBe("link");
    expect(mock_proxy).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget instead of hanging", async () => {
    mock_proxy.mockResolvedValue(RATE_LIMITED);

    const pending = execute_unsubscribe(ONE_CLICK_INFO, {
      retry_on_rate_limit: true,
    });

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    await expect(pending).resolves.toBe("link");
    expect(mock_proxy).toHaveBeenCalledTimes(5);
  });
});
