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
import type { ApiResponse } from "@/services/api/client/helpers";

import { describe, it, expect, vi } from "vitest";

import { store_with_rate_limit_retry } from "./import_fill";

function reply(status: number, retry_after_secs?: number): ApiResponse<number> {
  return status === 200
    ? { data: 1, status }
    : { error: "rate limited", status, retry_after_secs };
}

describe("store_with_rate_limit_retry", () => {
  it("waits for the server and sends the batch again after a rate limit", async () => {
    const send = vi
      .fn<() => Promise<ApiResponse<number>>>()
      .mockResolvedValueOnce(reply(429, 7))
      .mockResolvedValueOnce(reply(200));
    const wait = vi.fn(async () => {});

    const response = await store_with_rate_limit_retry(send, () => false, wait);

    expect(response.data).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(7000);
  });

  it("gives up after a few attempts", async () => {
    const send = vi.fn(async () => reply(429, 1));
    const wait = vi.fn(async () => {});

    const response = await store_with_rate_limit_retry(send, () => false, wait);

    expect(response.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("caps a long server wait", async () => {
    const send = vi
      .fn<() => Promise<ApiResponse<number>>>()
      .mockResolvedValueOnce(reply(429, 86_400))
      .mockResolvedValueOnce(reply(200));
    const wait = vi.fn(async () => {});

    await store_with_rate_limit_retry(send, () => false, wait);

    expect(wait).toHaveBeenCalledWith(120_000);
  });

  it("does not resend other failures or a cancelled import", async () => {
    const failed = vi.fn(async () => reply(500));
    const wait = vi.fn(async () => {});

    expect(
      (await store_with_rate_limit_retry(failed, () => false, wait)).status,
    ).toBe(500);
    expect(failed).toHaveBeenCalledTimes(1);

    const limited = vi.fn(async () => reply(429, 1));

    await store_with_rate_limit_retry(limited, () => true, wait);
    expect(limited).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
