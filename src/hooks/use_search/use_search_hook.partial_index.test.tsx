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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const index_state = vi.hoisted(() => ({ built_at: 0, complete: false }));
const scan_mock = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "reader@example.org" } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));

vi.mock("@/services/search/spelling", () => ({
  MIN_CORRECTED_RESULTS: 1,
  remember_never_correct_term: vi.fn(),
  suggest_query_correction: () => null,
}));

vi.mock("./index_cache", () => ({
  acquire_search_index: async (user_email: string, include_body: boolean) => ({
    items: [],
    decrypted: new Map(),
    built_at: index_state.built_at,
    include_body,
    user_email,
    disk_chunk_ids: [1],
    total_indexed: 0,
    complete: index_state.complete,
    meta: null,
  }),
  build_search_index: async () => {},
  mark_search_index_stale: vi.fn(),
  reset_index_cache: vi.fn(),
}));

vi.mock("./scan", () => ({
  scan_search_index: async () => {
    scan_mock.calls += 1;

    return false;
  },
}));

const { use_search } = await import("./use_search_hook");
const { emit_index_refreshed } = await import("./progress");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type SearchApi = ReturnType<typeof use_search>;

let api: SearchApi | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  api = use_search();

  return null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function run_search(query: string) {
  await act(async () => {
    api!.set_query(query);
    void api!.search(query, { fields: ["all"], search_body: false });
  });
  await settle();
}

beforeEach(async () => {
  index_state.built_at = 0;
  index_state.complete = false;
  scan_mock.calls = 0;
  api = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("use_search while the index is still building", () => {
  it("scans the index again when more mail has been indexed", async () => {
    await run_search("invoice");

    expect(scan_mock.calls).toBe(1);
    expect(api!.state.index_pending).toBe(true);

    await act(async () => {
      emit_index_refreshed();
    });
    await settle();

    expect(scan_mock.calls).toBe(2);
    expect(api!.state.results_query).toBe("invoice");
  });

  it("scans the index again for a narrower query", async () => {
    await run_search("invoice");
    await run_search("invoices");

    expect(scan_mock.calls).toBe(2);
  });

  it("reuses the previous matches for a narrower query once the index is built", async () => {
    index_state.built_at = 1700000000000;
    index_state.complete = true;

    await run_search("invoice");
    await run_search("invoices");

    expect(scan_mock.calls).toBe(1);
    expect(api!.state.index_pending).toBe(false);
  });
});
