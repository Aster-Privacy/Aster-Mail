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
import { describe, expect, it, vi } from "vitest";

import {
  with_vault_write_lock,
  with_vault_write_lock_bounded,
} from "./vault_write_lock";

function hold_lock(): () => void {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  void with_vault_write_lock(() => held);

  return release;
}

describe("bounded vault write lock", () => {
  it("never runs the write while another writer holds the lock", async () => {
    const release = hold_lock();
    const write = vi.fn(async () => "written");

    await expect(with_vault_write_lock_bounded(write, 20)).rejects.toThrow(
      "vault write lock wait timed out",
    );
    expect(write).not.toHaveBeenCalled();

    release();
    await with_vault_write_lock(async () => undefined);
    expect(write).not.toHaveBeenCalled();
  });

  it("runs the write once the lock is free", async () => {
    const write = vi.fn(async () => "written");

    await expect(with_vault_write_lock_bounded(write, 1000)).resolves.toBe(
      "written",
    );
    expect(write).toHaveBeenCalledTimes(1);
  });
});
