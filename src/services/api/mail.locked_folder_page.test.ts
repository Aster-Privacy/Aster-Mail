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

const get = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}));

const { list_locked_folder_page } = await import("./mail");
const { clear_all_folder_unlock_records, set_folder_unlock_record } =
  await import("@/services/folder_unlock_store");

const TOKEN = "ab+c/d= e";

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { items: [], has_more: false } });
  clear_all_folder_unlock_records();
});

function unlock() {
  set_folder_unlock_record({
    folder_id: "f1",
    folder_token: TOKEN,
    unlock_token: "secret-unlock",
    unlock_expires_at: null,
  });
}

describe("list_locked_folder_page", () => {
  it("lists the live folder with the unlock header", async () => {
    unlock();
    await list_locked_folder_page(TOKEN, 50, 50, false);

    const [endpoint, options] = get.mock.calls[0] as [
      string,
      { folder_unlock_token: string },
    ];
    const query = endpoint.split("?")[1];
    const params = new URLSearchParams(query);

    expect(endpoint.startsWith("/mail/v1/messages?")).toBe(true);
    expect(query).toContain("label_token=ab%2Bc%2Fd%3D%20e");
    expect(query).not.toContain("+");
    expect(params.get("label_token")).toBe(TOKEN);
    expect(params.get("offset")).toBe("50");
    expect(params.get("limit")).toBe("50");
    expect(params.get("include_envelope")).toBe("true");
    expect(params.get("skip_total")).toBe("true");
    expect(params.has("is_trashed")).toBe(false);
    expect(options.folder_unlock_token).toBe("secret-unlock");
    expect(endpoint).not.toContain("secret-unlock");
  });

  it("asks for trashed items in the trash phase", async () => {
    unlock();
    await list_locked_folder_page(TOKEN, 0, 50, true);

    const params = new URLSearchParams(
      (get.mock.calls[0][0] as string).split("?")[1],
    );

    expect(params.get("is_trashed")).toBe("true");
    expect(params.get("offset")).toBe("0");
  });

  it("does not list a locked folder", async () => {
    const response = await list_locked_folder_page(TOKEN, 0, 50, true);

    expect(response.status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });
});
