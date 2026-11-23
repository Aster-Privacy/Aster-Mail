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

const {
  DELIVERY_ARCHIVE_VALUE,
  DELIVERY_INBOX_VALUE,
  DELIVERY_NO_LABEL_VALUE,
  alias_run_confirm_kind,
  can_start_alias_run,
  use_alias_run,
} = await import("./delivery");

function make_run(status: AliasRun["status"]): AliasRun {
  return {
    run_id: "r1",
    alias_id: "a1",
    status,
    include_trashed: false,
    scanned: 12,
    matched: 7,
    applied: 7,
    created_at: "2026-11-23T00:00:00Z",
  } as AliasRun;
}

const ok = (status: AliasRun["status"]) => ({
  data: { run: make_run(status) },
});

describe("alias_run_confirm_kind", () => {
  it("returns null when the alias delivers to Inbox with no label", () => {
    expect(
      alias_run_confirm_kind(DELIVERY_INBOX_VALUE, DELIVERY_NO_LABEL_VALUE),
    ).toBeNull();
  });

  it("detects a folder-only alias", () => {
    expect(
      alias_run_confirm_kind(DELIVERY_ARCHIVE_VALUE, DELIVERY_NO_LABEL_VALUE),
    ).toBe("folder");
    expect(alias_run_confirm_kind("folder_tok", DELIVERY_NO_LABEL_VALUE)).toBe(
      "folder",
    );
  });

  it("detects a label-only alias", () => {
    expect(alias_run_confirm_kind(DELIVERY_INBOX_VALUE, "tag_tok")).toBe(
      "label",
    );
  });

  it("detects an alias with both a folder and a label", () => {
    expect(alias_run_confirm_kind("folder_tok", "tag_tok")).toBe(
      "folder_label",
    );
  });
});

describe("can_start_alias_run", () => {
  const base = {
    folder_value: "folder_tok",
    label_value: DELIVERY_NO_LABEL_VALUE,
    folder_type: "custom",
    run: null,
    busy: false,
  };

  it("allows a run when the alias has a folder", () => {
    expect(can_start_alias_run(base)).toBe(true);
  });

  it("allows a label-only run", () => {
    expect(
      can_start_alias_run({
        ...base,
        folder_value: DELIVERY_INBOX_VALUE,
        folder_type: null,
        label_value: "tag_tok",
      }),
    ).toBe(true);
  });

  it("blocks a run when there is nothing to apply", () => {
    expect(
      can_start_alias_run({
        ...base,
        folder_value: DELIVERY_INBOX_VALUE,
        folder_type: null,
      }),
    ).toBe(false);
  });

  it("blocks a run into Spam", () => {
    expect(can_start_alias_run({ ...base, folder_type: "spam" })).toBe(false);
  });

  it("blocks a second run while one is active", () => {
    expect(can_start_alias_run({ ...base, run: make_run("pending") })).toBe(
      false,
    );
    expect(can_start_alias_run({ ...base, run: make_run("running") })).toBe(
      false,
    );
  });

  it("allows a new run after the previous one finished", () => {
    expect(can_start_alias_run({ ...base, run: make_run("completed") })).toBe(
      true,
    );
    expect(can_start_alias_run({ ...base, run: make_run("canceled") })).toBe(
      true,
    );
  });

  it("blocks a run while settings are saving", () => {
    expect(can_start_alias_run({ ...base, busy: true })).toBe(false);
  });
});

let container: HTMLDivElement;
let root: Root;
let observed: ReturnType<typeof use_alias_run> | null = null;
const on_finished = vi.fn();

function Probe() {
  observed = use_alias_run("a1", on_finished);

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

describe("use_alias_run completion and support", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    get_alias_run.mockReset();
    on_finished.mockReset();
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

  it("reports the finished run once when an active run completes", async () => {
    get_alias_run
      .mockResolvedValueOnce(ok("running"))
      .mockResolvedValue(ok("completed"));

    await mount();
    await advance(60000);

    expect(on_finished).toHaveBeenCalledTimes(1);
    expect(on_finished.mock.calls[0][0].status).toBe("completed");
    expect(on_finished.mock.calls[0][0].applied).toBe(7);
  });

  it("does not report a run that had already finished before opening", async () => {
    get_alias_run.mockResolvedValue(ok("completed"));

    await mount();
    await advance(60000);

    expect(on_finished).not.toHaveBeenCalled();
  });

  it("reports a run started from the menu when it completes", async () => {
    get_alias_run.mockResolvedValueOnce({ data: { run: null } });

    await mount();
    get_alias_run.mockResolvedValue(ok("completed"));
    await act(async () => {
      observed?.track(make_run("pending"));
    });
    await advance(60000);

    expect(on_finished).toHaveBeenCalledTimes(1);
  });

  it("marks the feature unsupported when the route is missing", async () => {
    get_alias_run.mockResolvedValue({
      error: "Not found",
      status: 404,
    });

    await mount();
    await advance(60000);

    expect(observed?.unsupported).toBe(true);
    expect(get_alias_run).toHaveBeenCalledTimes(1);
  });

  it("stays supported when the server reports a known 404", async () => {
    get_alias_run.mockResolvedValue({
      error: "Alias not found",
      status: 404,
      server_code: "not_found",
    });

    await mount();

    expect(observed?.unsupported).toBe(false);
  });
});
