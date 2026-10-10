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

import { afterEach, describe, expect, it, vi } from "vitest";

const alias_state = vi.hoisted(() => ({
  hashes: new Map<string, string>(),
  subscribers: new Set<() => void>(),
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: (address: string) =>
    alias_state.hashes.get(address) ?? null,
  subscribe_aliases: (cb: () => void) => {
    alias_state.subscribers.add(cb);

    return () => {
      alias_state.subscribers.delete(cb);
    };
  },
}));

import { resolve_view_list_params } from "./views";

afterEach(() => {
  alias_state.hashes.clear();
  alias_state.subscribers.clear();
  vi.useRealTimers();
});

describe("resolve_view_list_params", () => {
  it("returns folder params without waiting", async () => {
    const params = await resolve_view_list_params("folder-abc");

    expect(params?.label_token).toBe("abc");
  });

  it("waits for the alias index before listing an alias view", async () => {
    const pending = resolve_view_list_params(
      "alias-late@aster.cx",
      undefined,
      5_000,
    );

    alias_state.hashes.set("late@aster.cx", "hash-late");
    alias_state.subscribers.forEach((cb) => cb());

    const params = await pending;

    expect(params?.routing_token).toBe("hash-late");
    expect(alias_state.subscribers.size).toBe(0);
  });

  it("never falls back to inbox params for an unknown alias", async () => {
    vi.useFakeTimers();
    const pending = resolve_view_list_params(
      "alias-gone@aster.cx",
      undefined,
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(await pending).toBeNull();
    expect(alias_state.subscribers.size).toBe(0);
  });

  it("stops waiting when the request is aborted", async () => {
    const controller = new AbortController();
    const pending = resolve_view_list_params(
      "alias-gone@aster.cx",
      controller.signal,
      60_000,
    );

    controller.abort();

    expect(await pending).toBeNull();
  });
});
