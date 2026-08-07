// Aster Mail
// Copyright (C) 2026 Aster Privacy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, expect, it, vi } from "vitest";

import { list_page_with_retry } from "./password_change_reencrypt";

describe("list_page_with_retry", () => {
  it("returns the first successful page without retrying", async () => {
    const fetch_page = vi.fn().mockResolvedValue({ data: { items: [] } });

    const response = await list_page_with_retry(fetch_page);

    expect(response.data).toEqual({ items: [] });
    expect(fetch_page).toHaveBeenCalledTimes(1);
  });

  it("recovers when a transient failure precedes a success", async () => {
    const fetch_page = vi
      .fn()
      .mockResolvedValueOnce({ error: "network", code: "NETWORK_ERROR" })
      .mockResolvedValueOnce({ data: { items: [] } });

    const response = await list_page_with_retry(fetch_page);

    expect(response.data).toEqual({ items: [] });
    expect(response.error).toBeUndefined();
    expect(fetch_page).toHaveBeenCalledTimes(2);
  });

  it("retries a rate limited page rather than aborting the change", async () => {
    const fetch_page = vi
      .fn()
      .mockResolvedValueOnce({ error: "slow down", code: "RATE_LIMITED" })
      .mockResolvedValueOnce({ error: "slow down", code: "RATE_LIMITED" })
      .mockResolvedValueOnce({ data: { items: [] } });

    const response = await list_page_with_retry(fetch_page);

    expect(response.data).toEqual({ items: [] });
    expect(fetch_page).toHaveBeenCalledTimes(3);
  });

  it("stops immediately on a definitive rejection", async () => {
    const fetch_page = vi
      .fn()
      .mockResolvedValue({ error: "denied", code: "FORBIDDEN" });

    const response = await list_page_with_retry(fetch_page);

    expect(response.error).toBe("denied");
    expect(fetch_page).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget is exhausted", async () => {
    const fetch_page = vi
      .fn()
      .mockResolvedValue({ error: "boom", code: "SERVER_ERROR" });

    const response = await list_page_with_retry(fetch_page);

    expect(response.error).toBe("boom");
    expect(fetch_page).toHaveBeenCalledTimes(4);
  });
});
