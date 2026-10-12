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
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

const scan_gates = vi.hoisted(() => ({ pending: [] as (() => void)[] }));

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
    built_at: Date.now(),
    include_body,
    user_email,
    disk_chunk_ids: [1],
    total_indexed: 0,
    complete: true,
    meta: null,
  }),
  build_search_index: async () => {},
  mark_search_index_stale: vi.fn(),
  reset_index_cache: vi.fn(),
}));

vi.mock("./scan", () => ({
  scan_search_index: () =>
    new Promise<boolean>((resolve) => {
      scan_gates.pending.push(() => resolve(false));
    }),
}));

const { use_search } = await import("./use_search_hook");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type SearchApi = ReturnType<typeof use_search>;

let api: SearchApi | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function ResultsHarness({ query }: { query: string }) {
  const search = use_search();

  api = search;

  useEffect(() => {
    search.set_query(query);
    void search.search(query, { fields: ["all"], search_body: true });

    return () => {
      search.clear_results();
    };
  }, [query]);

  return null;
}

async function render_query(query: string) {
  await act(async () => {
    root!.render(<ResultsHarness query={query} />);
  });
}

async function release_scans() {
  await act(async () => {
    const gates = scan_gates.pending.splice(0);

    for (const open of gates) open();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  scan_gates.pending = [];
  api = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("use_search repeated queries", () => {
  it("finishes a second search started right after the first is cleared", async () => {
    await render_query("morning");
    await release_scans();

    expect(api!.state.is_searching).toBe(false);
    expect(api!.state.results_query).toBe("morning");

    await render_query("news");
    await release_scans();

    expect(api!.state.is_searching).toBe(false);
    expect(api!.state.results_query).toBe("news");
  });

  it("drops the in-flight search when the query text changes", async () => {
    await render_query("morning");

    await act(async () => {
      api!.set_query("morning news");
    });
    await release_scans();

    expect(api!.state.results_query).toBe("");
    expect(api!.state.is_searching).toBe(true);

    await act(async () => {
      void api!.search("morning news", { fields: ["all"] });
    });
    await release_scans();

    expect(api!.state.is_searching).toBe(false);
    expect(api!.state.results_query).toBe("morning news");
  });
});
