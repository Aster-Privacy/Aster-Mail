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

describe("unsubscribe requests", () => {
  beforeEach(() => {
    mock_proxy.mockReset();
  });

  it("always sends the standard one-click body", async () => {
    mock_proxy.mockResolvedValue({
      data: { success: true, method: "one-click" },
    });

    await execute_unsubscribe({
      ...ONE_CLICK_INFO,
      list_unsubscribe_post: "list-unsubscribe=one-click",
    });

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "one-click",
      url: "https://sender.example.com/oc?t=abc",
      list_unsubscribe_post: "List-Unsubscribe=One-Click",
    });
  });

  it("never requests a plain link on the user's behalf", async () => {
    await expect(
      execute_unsubscribe({
        has_unsubscribe: true,
        method: "link",
        unsubscribe_link: "https://sender.example.com/unsubscribe?id=1",
        unsubscribe_page_url: "https://sender.example.com/unsubscribe?id=1",
      }),
    ).resolves.toBe("link");
    expect(mock_proxy).not.toHaveBeenCalled();
  });

  it("sends the unsubscribe email for an address-only list", async () => {
    mock_proxy.mockResolvedValue({ data: { success: true, method: "mailto" } });

    await expect(
      execute_unsubscribe({
        has_unsubscribe: true,
        method: "mailto",
        unsubscribe_mailto: "stop@sender.example.com",
      }),
    ).resolves.toBe("api");
    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "stop@sender.example.com",
    });
  });

  it("falls back to the address when the one-click request fails", async () => {
    mock_proxy
      .mockResolvedValueOnce({ error: "failed" })
      .mockResolvedValueOnce({ data: { success: true, method: "mailto" } });

    await expect(
      execute_unsubscribe({
        ...ONE_CLICK_INFO,
        unsubscribe_mailto: "stop@sender.example.com",
      }),
    ).resolves.toBe("api");
    expect(mock_proxy).toHaveBeenCalledTimes(2);
  });

  it("reports a manual email when the address request fails", async () => {
    mock_proxy.mockResolvedValue({ error: "failed" });

    await expect(
      execute_unsubscribe({
        has_unsubscribe: true,
        method: "mailto",
        unsubscribe_mailto: "stop@sender.example.com",
      }),
    ).resolves.toBe("mailto");
  });

  it("rejects when there is nothing to act on", async () => {
    await expect(
      execute_unsubscribe({ has_unsubscribe: false, method: "none" }),
    ).rejects.toMatchObject({ code: "no_method" });
  });
});
