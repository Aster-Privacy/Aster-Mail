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
const put = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
    put: (...args: unknown[]) => put(...args),
    get: vi.fn(),
  },
}));

const {
  move_mail_item,
  add_mail_item_folder,
  remove_mail_item_folder,
  bulk_add_folder,
  bulk_remove_folder,
  folder_bulk_body,
  merge_folder_bulk,
} = await import("./mail");

beforeEach(() => {
  post.mockReset();
  del.mockReset();
  put.mockReset();
  post.mockResolvedValue({ data: { status: "ok" } });
  del.mockResolvedValue({ data: { status: "ok" } });
});

describe("move_mail_item", () => {
  it("adds the destination folder label", async () => {
    const result = await move_mail_item("m1", { folder_token: "bills" });

    expect(post).toHaveBeenCalledWith("/mail/v1/messages/m1/labels", {
      folder_token: "bills",
    });
    expect(put).not.toHaveBeenCalled();
    expect(result.error).toBeUndefined();
  });

  it("drops the source folder label when one is given", async () => {
    await move_mail_item("m1", {
      folder_token: "bills",
      from_folder_token: "myfeed",
    });

    expect(del).toHaveBeenCalledWith("/mail/v1/messages/m1/labels/myfeed");
  });

  it("keeps the source folder label when the destination fails", async () => {
    post.mockResolvedValue({ error: "nope" });

    const result = await move_mail_item("m1", {
      folder_token: "bills",
      from_folder_token: "myfeed",
    });

    expect(result.error).toBe("nope");
    expect(del).not.toHaveBeenCalled();
  });
});

describe("conversation scoped folder changes", () => {
  it("keeps the per-message request when the scope is off", async () => {
    await add_mail_item_folder("m1", { folder_token: "bills" });
    await remove_mail_item_folder("m1", "bills", { include_thread: false });

    expect(post).toHaveBeenCalledWith("/mail/v1/messages/m1/labels", {
      folder_token: "bills",
    });
    expect(del).toHaveBeenCalledWith("/mail/v1/messages/m1/labels/bills");
  });

  it("files the whole conversation when the scope is on", async () => {
    post.mockResolvedValue({
      data: { status: "ok", affected: 3, ids: ["m1", "m2", "m3"] },
    });

    const result = await add_mail_item_folder(
      "m1",
      { folder_token: "bills" },
      { include_thread: true },
    );

    expect(post).toHaveBeenCalledWith("/mail/v1/messages/bulk/labels", {
      ids: ["m1"],
      label_token: "bills",
      include_thread: true,
    });
    expect(result.error).toBeUndefined();
  });

  it("removes the folder from the whole conversation when the scope is on", async () => {
    await remove_mail_item_folder("m1", "bills", { include_thread: true });

    expect(post).toHaveBeenCalledWith("/mail/v1/messages/bulk/labels/remove", {
      ids: ["m1"],
      label_token: "bills",
      include_thread: true,
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("moves the whole conversation and skips the source cleanup on failure", async () => {
    post.mockResolvedValueOnce({ error: "nope" });

    const result = await move_mail_item(
      "m1",
      { folder_token: "bills", from_folder_token: "myfeed" },
      { include_thread: true },
    );

    expect(result.error).toBe("nope");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("sends the scope with bulk requests only when asked", async () => {
    await bulk_add_folder(["a", "b"], "bills");
    await bulk_remove_folder(["a"], "bills", { include_thread: true });

    expect(post).toHaveBeenNthCalledWith(1, "/mail/v1/messages/bulk/labels", {
      ids: ["a", "b"],
      label_token: "bills",
    });
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/mail/v1/messages/bulk/labels/remove",
      { ids: ["a"], label_token: "bills", include_thread: true },
    );
  });

  it("builds the old body without a scope", () => {
    expect(folder_bulk_body(["a"], "t")).toEqual({
      ids: ["a"],
      label_token: "t",
    });
    expect(folder_bulk_body(["a"], "t", { include_thread: false })).toEqual({
      ids: ["a"],
      label_token: "t",
    });
  });

  it("merges chunk responses and their conversation ids", () => {
    expect(
      merge_folder_bulk(
        { status: "ok", affected: 2, ids: ["a", "b"] },
        { status: "ok", affected: 1, ids: ["b", "c"] },
      ),
    ).toEqual({ status: "ok", affected: 3, ids: ["a", "b", "c"] });
    expect(
      merge_folder_bulk(
        { status: "ok", affected: 1 },
        { status: "ok", affected: 2 },
      ),
    ).toEqual({ status: "ok", affected: 3 });
  });
});
