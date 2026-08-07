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

const { action_toasts, simple_toasts } = vi.hoisted(() => ({
  action_toasts: [] as Record<string, unknown>[],
  simple_toasts: [] as { message: string; kind: string }[],
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (config: Record<string, unknown>) => {
    action_toasts.push(config);
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string, kind: string) => {
    simple_toasts.push({ message, kind });
  },
}));

const {
  bulk_action_result,
  bulk_action_all_failed,
  bulk_outcome,
  bulk_succeeded_ids,
  show_bulk_result_toast,
} = await import("./bulk_action_result");

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${Object.values(params).join(",")}` : key;

function report(attempted: string[], failed: string[]) {
  return show_bulk_result_toast({
    result: bulk_action_result(attempted, failed),
    t: t as never,
    success_message: "done",
    error_message: "failed",
    action_type: "archive",
  });
}

beforeEach(() => {
  action_toasts.length = 0;
  simple_toasts.length = 0;
});

describe("bulk_action_result", () => {
  it("ignores failures that were never attempted and dedupes ids", () => {
    const result = bulk_action_result(["a", "a", "b"], ["b", "z"]);

    expect(result.attempted_ids).toEqual(["a", "b"]);
    expect(result.failed_ids).toEqual(["b"]);
    expect(bulk_succeeded_ids(result)).toEqual(["a"]);
    expect(bulk_outcome(result)).toBe("partial");
  });

  it("treats an all-failed batch as a failure", () => {
    const result = bulk_action_all_failed(["a", "b"]);

    expect(bulk_succeeded_ids(result)).toEqual([]);
    expect(bulk_outcome(result)).toBe("failure");
  });
});

describe("show_bulk_result_toast", () => {
  it("shows an undoable success toast scoped to the succeeded ids", () => {
    expect(report(["a", "b"], [])).toBe("success");

    expect(simple_toasts).toEqual([]);
    expect(action_toasts).toHaveLength(1);
    expect(action_toasts[0].email_ids).toEqual(["a", "b"]);
  });

  it("warns instead of claiming success when part of the batch failed", () => {
    expect(report(["a", "b", "c"], ["c"])).toBe("partial");

    expect(action_toasts).toEqual([]);
    expect(simple_toasts).toEqual([
      { message: "common.bulk_action_partially_applied:2,3", kind: "warning" },
    ]);
  });

  it("never shows a success toast when the whole batch failed", () => {
    expect(report(["a", "b"], ["a", "b"])).toBe("failure");

    expect(action_toasts).toEqual([]);
    expect(simple_toasts).toEqual([{ message: "failed", kind: "error" }]);
  });

  it("keeps undo off the failed ids", () => {
    const result = bulk_action_result(["a", "b", "c"], ["b"]);

    show_bulk_result_toast({
      result: bulk_action_result(bulk_succeeded_ids(result), []),
      t: t as never,
      success_message: "done",
      error_message: "failed",
      action_type: "archive",
    });

    expect(action_toasts[0].email_ids).toEqual(["a", "c"]);
  });
});
