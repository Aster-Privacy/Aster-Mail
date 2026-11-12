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

const post = vi.fn();
const del = vi.fn();
const patch = vi.fn();
const note_bulk_mail_removed = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
    patch: (...args: unknown[]) => patch(...args),
    get: vi.fn(),
  },
}));

vi.mock("@/services/search/index_removals", () => ({
  note_bulk_mail_removed: () => note_bulk_mail_removed(),
}));

const { purge_external_account_mail, delete_external_account } = await import(
  "./external_accounts/api"
);
const { delete_folder } = await import("./folders");
const { create_retention_policy, update_retention_policy } = await import(
  "./retention_policies"
);

function policy(delete_mode: string) {
  return {
    data: {
      id: "p1",
      folder_token: "f1",
      retention_days: 30,
      delete_mode,
      enabled: true,
      last_swept_at: null,
      created_at: "",
      updated_at: "",
    },
  };
}

beforeEach(() => {
  post.mockReset();
  del.mockReset();
  patch.mockReset();
  note_bulk_mail_removed.mockReset();
});

describe("search index after bulk removals", () => {
  it("checks the index after an account's mail is purged", async () => {
    post.mockResolvedValue({ data: { success: true, deleted_count: 3 } });

    await purge_external_account_mail("acct-1");

    expect(note_bulk_mail_removed).toHaveBeenCalledTimes(1);
  });

  it("leaves the index alone when the purge request fails", async () => {
    post.mockResolvedValue({ error: "offline" });

    await purge_external_account_mail("acct-1");

    expect(note_bulk_mail_removed).not.toHaveBeenCalled();
  });

  it("checks the index after an account is removed", async () => {
    del.mockResolvedValue({ data: { success: true } });

    await delete_external_account("acct-1");

    expect(note_bulk_mail_removed).toHaveBeenCalledTimes(1);
  });

  it("checks the index when a folder is deleted with its contents", async () => {
    del.mockResolvedValue({ data: { status: "ok", purged_items: 0 } });

    await delete_folder("folder-1", { purge_contents: true });

    expect(note_bulk_mail_removed).toHaveBeenCalledTimes(1);
  });

  it("skips the check when a folder is deleted without its contents", async () => {
    del.mockResolvedValue({ data: { status: "ok" } });

    await delete_folder("folder-1");

    expect(note_bulk_mail_removed).not.toHaveBeenCalled();
  });

  it("checks the index only for retention that deletes permanently", async () => {
    post.mockResolvedValue(policy("trash"));
    await create_retention_policy({
      folder_token: "f1",
      retention_days: 30,
      delete_mode: "trash",
    });

    expect(note_bulk_mail_removed).not.toHaveBeenCalled();

    patch.mockResolvedValue(policy("permanent"));
    await update_retention_policy("p1", { delete_mode: "permanent" });

    expect(note_bulk_mail_removed).toHaveBeenCalledTimes(1);
  });
});
