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
import type { AliasRun } from "@/services/api/aliases";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const get_alias_run = vi.fn();

vi.mock("@/services/api/aliases", () => ({
  get_alias_run: (...args: unknown[]) => get_alias_run(...args),
  run_alias_on_existing: vi.fn(),
  cancel_alias_run: vi.fn(),
}));

const { ALIAS_RUN_POLL_MAX_FAILURES, use_alias_run } = await import(
  "./delivery"
);

function make_run(status: AliasRun["status"]): AliasRun {
  return {
    run_id: "r1",
    alias_id: "a1",
    status,
    include_trashed: false,
    scanned: 10,
    matched: 10,
    applied: 10,
    created_at: "2026-08-09T00:00:00Z",
  } as AliasRun;
}

const ok = (status: AliasRun["status"]) => ({
  data: { run: make_run(status) },
});
const failure = { error: new Error("network") };

let container: HTMLDivElement;
let root: Root;
let observed: AliasRun | null = null;

function Probe() {
  const { run } = use_alias_run("a1");

  observed = run;

  return null;
}

async function mount() {
  await act(async () => {
    root.render(<Probe />);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("use_alias_run polling", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    vi.useFakeTimers();
    get_alias_run.mockReset();
    observed = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("keeps polling while the run is active", async () => {
    get_alias_run.mockResolvedValue(ok("running"));

    await mount();
    expect(get_alias_run).toHaveBeenCalledTimes(1);

    await advance(60000);
    expect(get_alias_run.mock.calls.length).toBeGreaterThan(3);
    expect(observed?.status).toBe("running");
  });

  it("survives a transient failure instead of freezing", async () => {
    get_alias_run
      .mockResolvedValueOnce(ok("running"))
      .mockResolvedValueOnce(failure)
      .mockResolvedValue(ok("completed"));

    await mount();
    await advance(60000);

    expect(observed?.status).toBe("completed");
  });

  it("gives up after repeated failures", async () => {
    get_alias_run
      .mockResolvedValueOnce(ok("running"))
      .mockResolvedValue(failure);

    await mount();
    await advance(120000);

    expect(get_alias_run.mock.calls.length).toBe(
      ALIAS_RUN_POLL_MAX_FAILURES + 1,
    );
  });

  it("stops once the run finishes", async () => {
    get_alias_run.mockResolvedValue(ok("completed"));

    await mount();
    await advance(60000);

    expect(get_alias_run).toHaveBeenCalledTimes(1);
    expect(observed?.status).toBe("completed");
  });

  it("does not poll after unmount", async () => {
    get_alias_run.mockResolvedValue(ok("running"));

    await mount();
    await advance(5000);

    const before = get_alias_run.mock.calls.length;

    await act(async () => {
      root.unmount();
    });
    await advance(60000);

    expect(get_alias_run.mock.calls.length).toBe(before);

    root = createRoot(container);
  });
});
