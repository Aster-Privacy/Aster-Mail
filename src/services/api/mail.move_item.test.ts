//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach } from "vitest";

const { post_mock, put_mock } = vi.hoisted(() => ({
  post_mock: vi.fn(),
  put_mock: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(),
    post: post_mock,
    patch: vi.fn(),
    put: put_mock,
    delete: vi.fn(),
  },
}));

import { move_mail_item } from "./mail";

describe("move_mail_item", () => {
  beforeEach(() => {
    post_mock.mockReset();
    put_mock.mockReset();
    post_mock.mockResolvedValue({ data: { status: "ok" } });
  });

  it("applies the folder through the label endpoint the server exposes", async () => {
    const result = await move_mail_item("item-1", { folder_token: "tok-9" });

    expect(post_mock).toHaveBeenCalledWith("/mail/v1/messages/item-1/labels", {
      folder_token: "tok-9",
    });
    expect(result.data?.status).toBe("ok");
  });

  it("never calls the move route, which the server does not implement", async () => {
    await move_mail_item("item-2", { folder_token: "tok-1" });

    expect(put_mock).not.toHaveBeenCalled();
  });
});
