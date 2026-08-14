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

const wrap_key_holder: { key: CryptoKey | null } = { key: null };

vi.mock("./device_key_store", () => ({
  get_device_wrap_key: vi.fn(async () => wrap_key_holder.key),
  clear_device_wrap_key_cache: vi.fn(),
  delete_device_wrap_key: vi.fn(async () => undefined),
}));

import {
  device_store,
  device_retrieve_strict,
  clear_device_encryption_cache,
} from "./secure_storage";

async function make_wrap_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

describe("device storage wrapping", () => {
  beforeEach(async () => {
    localStorage.clear();
    clear_device_encryption_cache();
    wrap_key_holder.key = await make_wrap_key();
  });

  it("writes payloads under the non-extractable wrapping key", async () => {
    await device_store("aster_test_entry", { token: "abc" });

    const raw = JSON.parse(localStorage.getItem("aster_test_entry") ?? "{}");

    expect(raw.v).toBe(2);
    expect(await device_retrieve_strict("aster_test_entry")).toEqual({
      token: "abc",
    });
  });

  it("keeps reading entries written before the wrapping key existed", async () => {
    wrap_key_holder.key = null;
    await device_store("aster_test_entry", { token: "legacy" });

    const legacy_raw = JSON.parse(
      localStorage.getItem("aster_test_entry") ?? "{}",
    );

    expect(legacy_raw.v).toBe(1);

    wrap_key_holder.key = await make_wrap_key();

    expect(await device_retrieve_strict("aster_test_entry")).toEqual({
      token: "legacy",
    });
  });

  it("re-wraps a legacy entry on first read", async () => {
    wrap_key_holder.key = null;
    await device_store("aster_test_entry", { token: "legacy" });
    wrap_key_holder.key = await make_wrap_key();

    await device_retrieve_strict("aster_test_entry");

    const raw = JSON.parse(localStorage.getItem("aster_test_entry") ?? "{}");

    expect(raw.v).toBe(2);
    expect(await device_retrieve_strict("aster_test_entry")).toEqual({
      token: "legacy",
    });
  });

  it("does not decrypt with storage values alone once wrapped", async () => {
    await device_store("aster_test_entry", { token: "abc" });

    wrap_key_holder.key = null;

    await expect(device_retrieve_strict("aster_test_entry")).rejects.toThrow();
  });
});
