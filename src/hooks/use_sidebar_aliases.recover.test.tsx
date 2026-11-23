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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  list_all_aliases: vi.fn(),
}));

vi.mock("@/services/api/aliases", () => ({
  list_all_aliases: mocks.list_all_aliases,
  decrypt_aliases: vi.fn(async (raw: { id: string }[]) =>
    raw.map((alias) => ({
      id: alias.id,
      local_part: alias.id,
      domain: "astermail.org",
      full_address: `${alias.id}@astermail.org`,
      is_enabled: true,
      is_random: false,
      alias_address_hash: "",
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    })),
  ),
  get_alias_counts: vi.fn(async () => ({ data: { can_create: true } })),
  get_alias_unread_counts: vi.fn(async () => ({ data: { counts: [] } })),
  reencrypt_alias_local_part: vi.fn(),
  compute_routing_hash: vi.fn(),
  backfill_missing_routing_hashes: vi.fn(),
  heal_legacy_routing_hashes: vi.fn(async () => false),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(async () => ({ data: { domains: [] } })),
  list_domain_addresses: vi.fn(),
  decrypt_domain_addresses: vi.fn(),
  compute_address_routing_hash: vi.fn(),
}));

vi.mock("@/services/api/ghost_aliases", () => ({
  list_ghost_aliases: vi.fn(async () => ({ data: null })),
  decrypt_ghost_aliases: vi.fn(),
}));

vi.mock("@/services/api/family_org", () => ({
  list_my_groups: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  get_derived_encryption_key: () => new Uint8Array(32),
  on_keys_ready: () => () => {},
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => null,
}));

import {
  clear_sidebar_aliases_cache,
  use_sidebar_aliases,
} from "@/hooks/use_sidebar_aliases";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FAILED = { error: "failed", aliases: [] };
const ONE_ALIAS = { aliases: [{ id: "work" }] };

type Snapshot = ReturnType<typeof use_sidebar_aliases>;

let root: Root;
let first: Snapshot;
let second: Snapshot;

function Probe() {
  first = use_sidebar_aliases();
  second = use_sidebar_aliases();

  return null;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function fail_foreground(): Promise<void> {
  mocks.list_all_aliases.mockResolvedValue(FAILED);
  await act(async () => {
    void first.refresh();
  });
  await advance(4_600);
  expect(first.load_failed).toBe(true);
}

function addresses(snapshot: Snapshot): string[] {
  return snapshot.aliases.map((alias) => alias.full_address);
}

describe("use_sidebar_aliases recovery", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    mocks.list_all_aliases.mockReset();
    clear_sidebar_aliases_cache();
    root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads on a background retry after the first attempts fail", async () => {
    await fail_foreground();

    mocks.list_all_aliases.mockResolvedValue(ONE_ALIAS);
    await advance(8_000);

    expect(first.load_failed).toBe(false);
    expect(addresses(first)).toEqual(["work@astermail.org"]);
  });

  it("keeps retrying while the list cannot be loaded", async () => {
    await fail_foreground();
    await advance(73_000);

    const calls = mocks.list_all_aliases.mock.calls.length;

    await advance(60_000);

    expect(mocks.list_all_aliases.mock.calls.length).toBeGreaterThan(calls);

    mocks.list_all_aliases.mockResolvedValue(ONE_ALIAS);
    await advance(60_000);

    expect(first.load_failed).toBe(false);

    const settled = mocks.list_all_aliases.mock.calls.length;

    await advance(300_000);

    expect(mocks.list_all_aliases).toHaveBeenCalledTimes(settled);
  });

  it("waits for the connection before polling again", async () => {
    await fail_foreground();
    await advance(73_000);

    const calls = mocks.list_all_aliases.mock.calls.length;
    const on_line = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await advance(180_000);

    expect(mocks.list_all_aliases).toHaveBeenCalledTimes(calls);

    on_line.mockRestore();
  });

  it("loads again when the connection returns", async () => {
    await fail_foreground();

    mocks.list_all_aliases.mockResolvedValue(ONE_ALIAS);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await advance(0);

    expect(first.load_failed).toBe(false);
    expect(second.load_failed).toBe(false);
    expect(addresses(second)).toEqual(["work@astermail.org"]);
  });

  it("loads again when the window comes back into view", async () => {
    await fail_foreground();

    mocks.list_all_aliases.mockResolvedValue(ONE_ALIAS);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(0);

    expect(first.load_failed).toBe(false);
    expect(addresses(first)).toEqual(["work@astermail.org"]);
  });

  it("loads again when the window gains focus", async () => {
    await fail_foreground();

    mocks.list_all_aliases.mockResolvedValue(ONE_ALIAS);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);

    expect(first.load_failed).toBe(false);
  });

  it("does not refetch on focus once the list has loaded", async () => {
    mocks.list_all_aliases.mockResolvedValue(ONE_ALIAS);
    await act(async () => {
      await first.refresh();
    });

    const calls = mocks.list_all_aliases.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });
    await advance(0);

    expect(mocks.list_all_aliases).toHaveBeenCalledTimes(calls);
  });

  it("sends one request when several window events fire together", async () => {
    await fail_foreground();

    let release: (value: unknown) => void = () => {};

    mocks.list_all_aliases.mockReset();
    mocks.list_all_aliases.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(0);

    expect(mocks.list_all_aliases).toHaveBeenCalledTimes(1);

    release(ONE_ALIAS);
    await advance(0);

    expect(first.load_failed).toBe(false);
  });

  it("clears the error on every instance when one instance loads", async () => {
    mocks.list_all_aliases.mockResolvedValue(FAILED);
    await act(async () => {
      void first.refresh();
      void second.refresh();
    });
    await advance(4_600);

    expect(second.load_failed).toBe(true);

    mocks.list_all_aliases.mockResolvedValue(ONE_ALIAS);
    await act(async () => {
      await first.refresh();
    });

    expect(second.load_failed).toBe(false);
    expect(second.is_loading).toBe(false);
  });

  it("stops retrying after the hook unmounts", async () => {
    await fail_foreground();

    const calls = mocks.list_all_aliases.mock.calls.length;

    await act(async () => {
      root.render(null);
    });
    await advance(200_000);

    expect(mocks.list_all_aliases).toHaveBeenCalledTimes(calls);
  });
});
