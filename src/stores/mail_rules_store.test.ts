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
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get_rule_run, emit_refresh_requested } = vi.hoisted(() => ({
  get_rule_run: vi.fn(),
  emit_refresh_requested: vi.fn(),
}));

vi.mock("@/services/api/mail_rules", () => ({
  get_rule_run,
  run_on_existing: vi.fn(),
  list_rules: vi.fn(),
  create_rule: vi.fn(),
  update_rule: vi.fn(),
  delete_rule: vi.fn(),
  reorder_rules: vi.fn(),
  cancel_rule_run: vi.fn(),
  list_rule_runs: vi.fn(),
}));

vi.mock("@/hooks/mail_events", () => ({ emit_refresh_requested }));

import { refresh_run, reset_mail_rules_store } from "./mail_rules_store";

function make_run(status: string, applied: number) {
  return {
    id: "run_1",
    rule_id: "rule_1",
    status,
    scanned: 10,
    matched: applied,
    applied,
    skipped: 0,
    skipped_encrypted: 0,
  };
}

describe("mail rules store run completion", () => {
  beforeEach(() => {
    reset_mail_rules_store();
    vi.clearAllMocks();
  });

  it("refreshes category tabs when a run finishes after moving mail", async () => {
    get_rule_run.mockResolvedValueOnce({ data: make_run("running", 0) });
    await refresh_run("rule_1");
    get_rule_run.mockResolvedValueOnce({ data: make_run("completed", 3) });
    await refresh_run("rule_1");

    expect(emit_refresh_requested).toHaveBeenCalledTimes(1);
  });

  it("refreshes when a canceled run had already moved mail", async () => {
    get_rule_run.mockResolvedValueOnce({ data: make_run("running", 0) });
    await refresh_run("rule_1");
    get_rule_run.mockResolvedValueOnce({ data: make_run("canceled", 2) });
    await refresh_run("rule_1");

    expect(emit_refresh_requested).toHaveBeenCalledTimes(1);
  });

  it("leaves the mail list alone when a run changed nothing", async () => {
    get_rule_run.mockResolvedValueOnce({ data: make_run("running", 0) });
    await refresh_run("rule_1");
    get_rule_run.mockResolvedValueOnce({ data: make_run("completed", 0) });
    await refresh_run("rule_1");

    expect(emit_refresh_requested).not.toHaveBeenCalled();
  });

  it("does not refresh again for a run that was already finished", async () => {
    get_rule_run.mockResolvedValue({ data: make_run("completed", 3) });
    await refresh_run("rule_1");
    await refresh_run("rule_1");

    expect(emit_refresh_requested).not.toHaveBeenCalled();
  });
});
