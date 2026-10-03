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
import { describe, expect, it, vi } from "vitest";

import { emit_refresh_requested } from "@/hooks/mail_events";
import { request_cache } from "@/services/api/request_cache";

describe("emit_refresh_requested", () => {
  it("drops cached mail list and stats responses so refresh sees new mail", async () => {
    const list_key = "GET:/mail/v1/messages?limit=25&item_type=received";
    const stats_key = "GET:/mail/v1/messages/stats";
    const stale_fetch = vi.fn(async () => ({ data: "stale" }));
    const fresh_fetch = vi.fn(async () => ({ data: "fresh" }));

    await request_cache.get_or_fetch(list_key, stale_fetch);
    await request_cache.get_or_fetch(stats_key, stale_fetch);

    emit_refresh_requested();

    const list = await request_cache.get_or_fetch(list_key, fresh_fetch);
    const stats = await request_cache.get_or_fetch(stats_key, fresh_fetch);

    expect(list).toEqual({ data: "fresh" });
    expect(stats).toEqual({ data: "fresh" });
    expect(fresh_fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps unrelated cached responses", async () => {
    const other_key = "GET:/contacts/v1/count";
    const first = vi.fn(async () => ({ data: 1 }));
    const second = vi.fn(async () => ({ data: 2 }));

    await request_cache.get_or_fetch(other_key, first);
    emit_refresh_requested();

    expect(await request_cache.get_or_fetch(other_key, second)).toEqual({
      data: 1,
    });
    expect(second).not.toHaveBeenCalled();
  });
});
