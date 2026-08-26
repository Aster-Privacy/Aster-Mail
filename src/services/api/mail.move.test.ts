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

const { move_mail_item } = await import("./mail");

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
