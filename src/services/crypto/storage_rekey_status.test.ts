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
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  STORAGE_REKEY_STATUS_PATH,
  STORAGE_REKEY_STATUS_TTL_MS,
  fetch_storage_rekey_status,
  reset_storage_rekey_status,
} from "./storage_rekey_status";
import {
  get_level2_admission,
  request_level2_admission,
  reset_level2_state,
} from "./vault_level2";

beforeEach(() => {
  reset_level2_state();
  reset_storage_rekey_status();
});

describe("storage rekey status", () => {
  it("reads the status once and shares it between callers", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { may_start: false, level2_admitted: false },
    });

    const [first, second] = await Promise.all([
      fetch_storage_rekey_status({ get }, 1000),
      fetch_storage_rekey_status({ get }, 2000),
    ]);

    expect(first).toEqual({ may_start: false, level2_admitted: false });
    expect(second).toEqual(first);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(STORAGE_REKEY_STATUS_PATH);
  });

  it("asks again once the answer is old", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { may_start: true, level2_admitted: true },
    });

    await fetch_storage_rekey_status({ get }, 1000);
    await fetch_storage_rekey_status(
      { get },
      1000 + STORAGE_REKEY_STATUS_TTL_MS,
    );

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("returns nothing for a failed or malformed answer and retries", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ error: "x", status: 500 })
      .mockResolvedValueOnce({ data: { may_start: "yes" } })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        data: { may_start: true, level2_admitted: false },
      });

    expect(await fetch_storage_rekey_status({ get }, 1000)).toBeNull();
    expect(await fetch_storage_rekey_status({ get }, 1001)).toBeNull();
    expect(await fetch_storage_rekey_status({ get }, 1002)).toBeNull();
    expect(await fetch_storage_rekey_status({ get }, 1003)).toEqual({
      may_start: true,
      level2_admitted: false,
    });
  });

  it("drops an answer that lands after a reset", async () => {
    let resolve_get: (value: unknown) => void = () => undefined;
    const get = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolve_get = resolve;
      }),
    );
    const pending = fetch_storage_rekey_status({ get }, 1000);

    reset_storage_rekey_status();
    resolve_get({ data: { may_start: true, level2_admitted: true } });

    expect(await pending).toBeNull();
  });
});

describe("level 2 admission with a status answer", () => {
  it("does not post when the status says not admitted", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { may_start: false, level2_admitted: false },
    });
    const post = vi.fn();

    expect(await request_level2_admission({ get, post })).toBe("refused");
    expect(await request_level2_admission({ get, post })).toBe("refused");
    expect(post).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("posts when the status says admitted", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { may_start: true, level2_admitted: true },
    });
    const post = vi.fn().mockResolvedValue({
      data: { level2_admitted: true },
    });

    expect(await request_level2_admission({ get, post })).toBe("admitted");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("falls back to the post when the status is unavailable", async () => {
    const get = vi.fn().mockResolvedValue({ error: "x", status: 503 });
    const post = vi.fn().mockResolvedValue({
      error: "x",
      status: 409,
      server_code: "VAULT_LEVEL2_NOT_ADMITTED",
    });

    expect(await request_level2_admission({ get, post })).toBe("refused");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("ignores a status answer that lands after a reset", async () => {
    let resolve_get: (value: unknown) => void = () => undefined;
    const get = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolve_get = resolve;
      }),
    );
    const post = vi.fn();
    const pending = request_level2_admission({ get, post });

    reset_level2_state();
    resolve_get({ data: { may_start: false, level2_admitted: false } });

    expect(await pending).toBe("unknown");
    expect(get_level2_admission()).toBe("unknown");
    expect(post).not.toHaveBeenCalled();
  });
});
