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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  list_tags: vi.fn(),
}));

vi.mock("@/services/api/tags", () => ({
  list_tags: mocks.list_tags,
  create_tag: vi.fn(),
  update_tag: vi.fn(),
  delete_tag: vi.fn(),
  get_tag_counts: vi.fn(async () => ({ data: { counts: {} }, error: null })),
  add_tag_to_item: vi.fn(),
  remove_tag_from_item: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "identity" }),
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/contexts/auth_context", () => {
  const auth = { user: { id: "user-1" } };

  return { use_auth_safe: () => auth };
});

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (key: string) => key };

  return { use_i18n: () => i18n };
});

import { use_tags, clear_tags_cache } from "@/hooks/use_tags";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FAILED = { data: null, error: "failed" };
const EMPTY = { data: { tags: [], total: 0 }, error: null };

type Snapshot = ReturnType<typeof use_tags>;

let root: Root;
let first: Snapshot;
let second: Snapshot;

function Probe() {
  first = use_tags();
  second = use_tags();

  return null;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function fail_all_retries(): Promise<void> {
  mocks.list_tags.mockResolvedValue(FAILED);
  await act(async () => {
    void first.fetch_tags();
  });
  await advance(4_600 + 73_000);
  expect(first.state.error).toBe("common.failed_to_fetch_tags");
}

describe("use_tags recovery", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    mocks.list_tags.mockReset();
    clear_tags_cache();
    root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(createElement(Probe));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps retrying after the background retries run out", async () => {
    await fail_all_retries();

    const calls = mocks.list_tags.mock.calls.length;

    await advance(60_000);

    expect(mocks.list_tags.mock.calls.length).toBeGreaterThan(calls);

    mocks.list_tags.mockResolvedValue(EMPTY);
    await advance(60_000);

    expect(first.state.error).toBeNull();

    const settled = mocks.list_tags.mock.calls.length;

    await advance(300_000);

    expect(mocks.list_tags).toHaveBeenCalledTimes(settled);
  });

  it("waits for the connection before polling again", async () => {
    await fail_all_retries();

    const calls = mocks.list_tags.mock.calls.length;

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await advance(180_000);

    expect(mocks.list_tags).toHaveBeenCalledTimes(calls);
  });

  it("loads again when the connection returns", async () => {
    await fail_all_retries();

    mocks.list_tags.mockResolvedValue(EMPTY);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await advance(0);

    expect(first.state.error).toBeNull();
    expect(second.state.error).toBeNull();
  });

  it("loads again when the window comes back into view", async () => {
    await fail_all_retries();

    mocks.list_tags.mockResolvedValue(EMPTY);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(0);

    expect(first.state.error).toBeNull();
  });

  it("loads again when the window gains focus", async () => {
    await fail_all_retries();

    mocks.list_tags.mockResolvedValue(EMPTY);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);

    expect(first.state.error).toBeNull();
  });

  it("does not refetch on focus once the labels have loaded", async () => {
    mocks.list_tags.mockResolvedValue(EMPTY);
    await act(async () => {
      await first.fetch_tags();
    });

    const calls = mocks.list_tags.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });
    await advance(0);

    expect(mocks.list_tags).toHaveBeenCalledTimes(calls);
  });

  it("sends one request when several window events fire together", async () => {
    await fail_all_retries();

    mocks.list_tags.mockReset();
    mocks.list_tags.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);

    expect(mocks.list_tags).toHaveBeenCalledTimes(1);
  });

  it("stops retrying after the hook unmounts", async () => {
    mocks.list_tags.mockResolvedValue(FAILED);
    await act(async () => {
      void first.fetch_tags();
    });
    await advance(4_600);

    await act(async () => {
      root.render(null);
    });

    const calls = mocks.list_tags.mock.calls.length;

    await advance(300_000);

    expect(mocks.list_tags).toHaveBeenCalledTimes(calls);
  });
});
