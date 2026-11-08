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

const verify_folder_password = vi.fn();

vi.mock("@/services/api/folders", () => ({
  verify_folder_password: (...args: unknown[]) =>
    verify_folder_password(...args),
}));

const { request_folder_unlock_grant } = await import("./folder_unlock_grant");

beforeEach(() => {
  verify_folder_password.mockReset();
});

describe("request_folder_unlock_grant", () => {
  it("returns the server unlock token for a verified password", async () => {
    verify_folder_password.mockResolvedValue({
      data: {
        verified: true,
        unlock_token: "server-token",
        unlock_expires_at: "2030-01-01T00:00:00Z",
      },
    });

    const grant = await request_folder_unlock_grant("f1", "hash");

    expect(verify_folder_password).toHaveBeenCalledWith("f1", {
      password_hash: "hash",
    });
    expect(grant).toEqual({
      unlock_token: "server-token",
      unlock_expires_at: Date.parse("2030-01-01T00:00:00Z"),
    });
  });

  it("returns null when the password is not verified", async () => {
    verify_folder_password.mockResolvedValue({ data: { verified: false } });

    expect(await request_folder_unlock_grant("f1", "hash")).toBeNull();
  });

  it("returns null when the server issues no unlock token", async () => {
    verify_folder_password.mockResolvedValue({ data: { verified: true } });

    expect(await request_folder_unlock_grant("f1", "hash")).toBeNull();
  });

  it("returns null when the request fails", async () => {
    verify_folder_password.mockResolvedValue({
      error: "offline",
      code: "NETWORK_ERROR",
    });

    expect(await request_folder_unlock_grant("f1", "hash")).toBeNull();
  });

  it("returns null when the request throws", async () => {
    verify_folder_password.mockRejectedValue(new Error("boom"));

    expect(await request_folder_unlock_grant("f1", "hash")).toBeNull();
  });
});
