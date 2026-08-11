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
import { describe, it, expect, vi, beforeEach } from "vitest";

import { get_rule_run, list_rule_runs } from "./mail_rules";
import { api_client } from "./client";

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mocked_get = vi.mocked(api_client.get);

const base_run = {
  run_id: "run-1",
  rule_id: "rule-1",
  status: "completed",
  include_trashed: false,
  scanned: 120,
  matched: 8,
  applied: 3,
  skipped: 5,
  created_at: "2026-08-10T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rule run encrypted skip count", () => {
  it("carries skipped_encrypted through from the wire", async () => {
    mocked_get.mockResolvedValue({
      data: { run: { ...base_run, skipped_encrypted: 42 } },
    });

    const result = await get_rule_run("rule-1");

    expect(result.data?.skipped_encrypted).toBe(42);
  });

  it("defaults to zero when an older backend omits the field", async () => {
    mocked_get.mockResolvedValue({ data: { run: base_run } });

    const result = await get_rule_run("rule-1");

    expect(result.data?.skipped_encrypted).toBe(0);
  });

  it("maps the field for every run in the list response", async () => {
    mocked_get.mockResolvedValue({
      data: {
        runs: [
          { ...base_run, run_id: "run-1", skipped_encrypted: 7 },
          { ...base_run, run_id: "run-2" },
        ],
      },
    });

    const result = await list_rule_runs();

    expect(result.data?.map((r) => r.skipped_encrypted)).toEqual([7, 0]);
  });
});
