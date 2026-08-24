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

const cancel_scheduled_email = vi.fn();
const emit_scheduled_changed = vi.fn();
const emit_mail_changed = vi.fn();
const invalidate_mail_stats = vi.fn();

vi.mock("@/services/api/scheduled", () => ({
  cancel_scheduled_email: (id: string) => cancel_scheduled_email(id),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_scheduled_changed: (detail: unknown) => emit_scheduled_changed(detail),
  emit_mail_changed: () => emit_mail_changed(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: () => invalidate_mail_stats(),
}));

import { cancel_scheduled_ids } from "./scheduled_delete";

describe("cancel_scheduled_ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels every id and reports them as succeeded", async () => {
    cancel_scheduled_email.mockResolvedValue({ data: { success: true } });

    const succeeded = await cancel_scheduled_ids(["a", "b"]);

    expect(succeeded).toEqual(["a", "b"]);
    expect(cancel_scheduled_email).toHaveBeenCalledTimes(2);
    expect(emit_mail_changed).toHaveBeenCalledTimes(1);
  });

  it("reports only the ids the server accepted", async () => {
    cancel_scheduled_email.mockImplementation((id: string) =>
      id === "bad"
        ? Promise.resolve({ error: "nope" })
        : Promise.resolve({ data: { success: true } }),
    );

    const succeeded = await cancel_scheduled_ids(["good", "bad"]);

    expect(succeeded).toEqual(["good"]);
    expect(emit_scheduled_changed).toHaveBeenCalledWith({
      action: "cancelled",
      email_id: "good",
    });
    expect(emit_scheduled_changed).toHaveBeenCalledWith({
      action: "cancelled",
    });
  });

  it("treats a rejected request as a failure", async () => {
    cancel_scheduled_email.mockRejectedValue(new Error("offline"));

    const succeeded = await cancel_scheduled_ids(["a"]);

    expect(succeeded).toEqual([]);
  });

  it("does nothing for an empty list", async () => {
    const succeeded = await cancel_scheduled_ids([]);

    expect(succeeded).toEqual([]);
    expect(cancel_scheduled_email).not.toHaveBeenCalled();
    expect(emit_mail_changed).not.toHaveBeenCalled();
  });
});
