//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
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
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

import {
  set_cached_preview_url,
  get_cached_preview_url,
  clear_attachment_preview_cache,
} from "./attachment_preview_cache";

const revoked: string[] = [];

describe("preview cache never revokes a url that was just rendered", () => {
  beforeEach(() => {
    revoked.length = 0;
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:new",
      revokeObjectURL: (url: string) => revoked.push(url),
    });
    clear_attachment_preview_cache();
  });

  afterEach(() => {
    clear_attachment_preview_cache();
    vi.unstubAllGlobals();
  });

  it("keeps every thumbnail of a message with more than the soft cap", () => {
    for (let index = 0; index < 200; index++) {
      set_cached_preview_url(`att_${index}`, `blob:att_${index}`);
    }

    expect(revoked).toEqual([]);
    expect(get_cached_preview_url("att_0")).toBe("blob:att_0");
    expect(get_cached_preview_url("att_199")).toBe("blob:att_199");
  });

  it("still evicts entries that have gone cold", () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now");

    clock.mockReturnValue(now);

    for (let index = 0; index < 100; index++) {
      set_cached_preview_url(`cold_${index}`, `blob:cold_${index}`);
    }

    expect(revoked).toEqual([]);

    clock.mockReturnValue(now + 60_000);
    set_cached_preview_url("warm", "blob:warm");

    expect(revoked.length).toBeGreaterThan(0);
    expect(revoked).toContain("blob:cold_0");
    expect(get_cached_preview_url("warm")).toBe("blob:warm");

    clock.mockRestore();
  });

  it("enforces a hard ceiling even under sustained pressure", () => {
    for (let index = 0; index < 600; index++) {
      set_cached_preview_url(`burst_${index}`, `blob:burst_${index}`);
    }

    expect(revoked.length).toBeGreaterThan(0);
    expect(get_cached_preview_url("burst_599")).toBe("blob:burst_599");
  });
});
