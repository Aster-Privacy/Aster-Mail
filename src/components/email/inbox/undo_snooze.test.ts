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

const unsnooze_by_mail_item = vi.fn();
const emit_mail_item_updated = vi.fn();
const emit_snoozed_changed = vi.fn();
const reindex_ids = vi.fn();

vi.mock("@/services/api/snooze", () => ({
  unsnooze_by_mail_item: (id: string) => unsnooze_by_mail_item(id),
}));

vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: { MAIL_SOFT_REFRESH: "astermail:mail-soft-refresh" },
  emit_mail_item_updated: (detail: unknown) => emit_mail_item_updated(detail),
  emit_snoozed_changed: () => emit_snoozed_changed(),
}));

vi.mock("@/services/category_index", () => ({
  reindex_ids: (ids: string[]) => reindex_ids(ids),
}));

import { undo_snooze } from "@/components/email/inbox/undo_snooze";

describe("undo_snooze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unsnoozes every message in the conversation", async () => {
    unsnooze_by_mail_item.mockResolvedValue({});

    await undo_snooze(["a", "b"]);

    expect(unsnooze_by_mail_item).toHaveBeenCalledTimes(2);
    expect(emit_mail_item_updated).toHaveBeenCalledWith({
      id: "a",
      snoozed_until: null,
    });
    expect(emit_mail_item_updated).toHaveBeenCalledWith({
      id: "b",
      snoozed_until: null,
    });
    expect(reindex_ids).toHaveBeenCalledWith(["a", "b"]);
    expect(emit_snoozed_changed).toHaveBeenCalledTimes(1);
  });

  it("restores what it can and reports a partial failure", async () => {
    unsnooze_by_mail_item.mockImplementation((id: string) =>
      id === "b" ? Promise.resolve({ error: "nope" }) : Promise.resolve({}),
    );

    await expect(undo_snooze(["a", "b"])).rejects.toThrow();
    expect(reindex_ids).toHaveBeenCalledWith(["a"]);
    expect(emit_mail_item_updated).toHaveBeenCalledTimes(1);
  });

  it("reports failure when the request throws", async () => {
    unsnooze_by_mail_item.mockRejectedValue(new Error("offline"));

    await expect(undo_snooze(["a"])).rejects.toThrow();
    expect(reindex_ids).not.toHaveBeenCalled();
  });
});
