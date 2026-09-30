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

const recover_session = vi.fn();

vi.mock("./client", () => ({
  api_client: { recover_session: () => recover_session() },
}));

import { is_session_failure, with_session_recovery } from "./session_recovery";

describe("with_session_recovery", () => {
  beforeEach(() => {
    recover_session.mockReset();
  });

  it("returns a successful response without recovering", async () => {
    const run = vi.fn().mockResolvedValue({ data: { ok: true } });

    const result = await with_session_recovery(run);

    expect(result).toEqual({ data: { ok: true } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(recover_session).not.toHaveBeenCalled();
  });

  it("retries once after an expired csrf cookie is recovered", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        error: "CSRF token required",
        status: 403,
        server_code: "CSRF_INVALID",
      })
      .mockResolvedValueOnce({ data: { id: "sent" } });

    recover_session.mockResolvedValue(true);

    const result = await with_session_recovery(run);

    expect(result).toEqual({ data: { id: "sent" } });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries once after a 401 is recovered", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ error: "unauthorized", status: 401 })
      .mockResolvedValueOnce({ data: { id: "sent" } });

    recover_session.mockResolvedValue(true);

    await expect(with_session_recovery(run)).resolves.toEqual({
      data: { id: "sent" },
    });
  });

  it("returns the original failure when recovery fails", async () => {
    const failure = { error: "unauthorized", status: 401 };
    const run = vi.fn().mockResolvedValue(failure);

    recover_session.mockRejectedValue(new Error("offline"));

    await expect(with_session_recovery(run)).resolves.toBe(failure);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not treat other forbidden responses as session failures", () => {
    expect(
      is_session_failure({ error: "no", status: 403, server_code: "FORBIDDEN" }),
    ).toBe(false);
    expect(is_session_failure({ error: "big", status: 413 })).toBe(false);
  });
});
