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
import type { LogoTone } from "@/lib/logo_tone";

import { describe, it, expect, vi, afterEach } from "vitest";

const read_logo_tone = vi.fn<(blob: Blob) => Promise<LogoTone | null>>();

vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
  throw new Error("unavailable");
});

vi.mock("@/lib/logo_tone", () => ({
  read_logo_tone: (blob: Blob) => read_logo_tone(blob),
}));

const {
  cache_favicon_blob,
  peek_favicon_tone,
  purge_favicon_cache,
  subscribe_favicon_tones,
} = await import("./favicon_cache_db");

describe("favicon cache logo tone", () => {
  afterEach(async () => {
    read_logo_tone.mockReset();
    await purge_favicon_cache();
  });

  it("analyses a favicon once when it is cached and notifies listeners", async () => {
    read_logo_tone.mockResolvedValue("dark");
    const listener = vi.fn();
    const unsubscribe = subscribe_favicon_tones(listener);

    expect(peek_favicon_tone("pt.pt")).toBeNull();

    await cache_favicon_blob("pt.pt", new Blob(["x"], { type: "image/png" }));

    expect(read_logo_tone).toHaveBeenCalledTimes(1);
    expect(peek_favicon_tone("pt.pt")).toBe("dark");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("keeps today's look when the pixels cannot be read", async () => {
    read_logo_tone.mockResolvedValue(null);

    await cache_favicon_blob("pt.pt", new Blob(["x"], { type: "image/png" }));

    expect(peek_favicon_tone("pt.pt")).toBeNull();
  });

  it("forgets tones when the cache is purged", async () => {
    read_logo_tone.mockResolvedValue("light");

    await cache_favicon_blob("pt.pt", new Blob(["x"], { type: "image/png" }));
    await purge_favicon_cache();

    expect(peek_favicon_tone("pt.pt")).toBeNull();
  });
});
