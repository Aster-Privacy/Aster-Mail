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

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("./client", () => ({ api_client: { get: h.get } }));

import {
  CAPABILITIES_FAILURE_RETRY_MS,
  account_key_capabilities_known,
  get_account_key_capabilities,
  reset_account_key_capabilities_cache,
} from "./account_key";

describe("account key capabilities", () => {
  beforeEach(() => {
    h.get.mockReset();
    reset_account_key_capabilities_cache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares one request between concurrent callers", async () => {
    h.get.mockResolvedValue({ data: { format_writes: true } });

    const [first, second] = await Promise.all([
      get_account_key_capabilities(),
      get_account_key_capabilities(),
    ]);

    expect(h.get).toHaveBeenCalledTimes(1);
    expect(first.format_writes).toBe(true);
    expect(second.format_writes).toBe(true);
  });

  it("does not remember a refused request as the real answer", async () => {
    h.get.mockResolvedValueOnce({ error: "Unauthorized", status: 401 });

    const refused = await get_account_key_capabilities();

    expect(refused.format_writes).toBe(false);
    expect(account_key_capabilities_known()).toBe(false);
  });

  it("waits a short time before asking again after a failure", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);

    h.get.mockResolvedValueOnce({ error: "Unauthorized", status: 401 });
    await get_account_key_capabilities();
    await get_account_key_capabilities();

    expect(h.get).toHaveBeenCalledTimes(1);

    h.get.mockResolvedValueOnce({ data: { format_writes: true } });
    clock.mockReturnValue(now + CAPABILITIES_FAILURE_RETRY_MS + 1);
    const recovered = await get_account_key_capabilities();

    expect(h.get).toHaveBeenCalledTimes(2);
    expect(recovered.format_writes).toBe(true);
    expect(account_key_capabilities_known()).toBe(true);
  });

  it("drops a late answer that arrives after the cache was reset", async () => {
    let resolve: (value: unknown) => void = () => undefined;

    h.get.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = get_account_key_capabilities();

    reset_account_key_capabilities_cache();
    resolve({ data: { format_writes: true } });
    await pending;

    expect(account_key_capabilities_known()).toBe(false);
  });
});
