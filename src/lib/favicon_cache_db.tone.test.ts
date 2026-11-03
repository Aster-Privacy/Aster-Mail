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
import type { LogoLook } from "@/lib/logo_tone";

import { describe, it, expect, vi, afterEach } from "vitest";

const read_logo_look = vi.fn<(blob: Blob) => Promise<LogoLook | null>>();

vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
  throw new Error("unavailable");
});

vi.mock("@/lib/logo_tone", () => ({
  read_logo_look: (blob: Blob) => read_logo_look(blob),
}));

const {
  cache_favicon_blob,
  peek_favicon_look,
  purge_favicon_cache,
  subscribe_favicon_looks,
} = await import("./favicon_cache_db");

describe("favicon cache logo look", () => {
  afterEach(async () => {
    read_logo_look.mockReset();
    await purge_favicon_cache();
  });

  it("analyses a favicon once when it is cached and notifies listeners", async () => {
    read_logo_look.mockResolvedValue({ tone: "dark", fill: 100 });
    const listener = vi.fn();
    const unsubscribe = subscribe_favicon_looks(listener);

    expect(peek_favicon_look("pt.pt")).toBeNull();

    await cache_favicon_blob("pt.pt", new Blob(["x"], { type: "image/png" }));

    expect(read_logo_look).toHaveBeenCalledTimes(1);
    expect(peek_favicon_look("pt.pt")).toEqual({ tone: "dark", fill: 100 });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("keeps the fill of a padded opaque tile", async () => {
    read_logo_look.mockResolvedValue({ tone: "none", fill: 125 });

    await cache_favicon_blob("pt.pt", new Blob(["x"], { type: "image/png" }));

    expect(peek_favicon_look("pt.pt")).toEqual({ tone: "none", fill: 125 });
  });

  it("returns the same look object when a recache finds the same look", async () => {
    read_logo_look.mockImplementation(async () => ({
      tone: "none",
      fill: 110,
    }));

    await cache_favicon_blob("pt.pt", new Blob(["x"], { type: "image/png" }));
    const first = peek_favicon_look("pt.pt");

    await cache_favicon_blob("pt.pt", new Blob(["y"], { type: "image/png" }));

    expect(peek_favicon_look("pt.pt")).toBe(first);
  });

  it("keeps today's look when the pixels cannot be read", async () => {
    read_logo_look.mockResolvedValue(null);

    await cache_favicon_blob("pt.pt", new Blob(["x"], { type: "image/png" }));

    expect(peek_favicon_look("pt.pt")).toBeNull();
  });

  it("forgets looks when the cache is purged", async () => {
    read_logo_look.mockResolvedValue({ tone: "light", fill: 100 });

    await cache_favicon_blob("pt.pt", new Blob(["x"], { type: "image/png" }));
    await purge_favicon_cache();

    expect(peek_favicon_look("pt.pt")).toBeNull();
  });
});
