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

let wrap_key: CryptoKey | null = null;

vi.mock("./device_key_store", () => ({
  get_device_wrap_key: vi.fn(async () => wrap_key),
  clear_device_wrap_key_cache: vi.fn(),
  delete_device_wrap_key: vi.fn(async () => undefined),
}));

const { device_store, device_retrieve_strict } =
  await import("./secure_storage");

const KEY = "astermail_device_store_probe";
const redact = (value: { secret?: string; name: string }) => ({
  name: value.name,
});

describe("device_store redaction", () => {
  beforeEach(() => {
    localStorage.clear();
    wrap_key = null;
  });

  it("stores the full value under a device-bound key", async () => {
    wrap_key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    await device_store(KEY, { secret: "s", name: "n" }, redact);

    expect(await device_retrieve_strict(KEY)).toEqual({
      secret: "s",
      name: "n",
    });
  });

  it("stores the redacted value without a device-bound key", async () => {
    await device_store(KEY, { secret: "s", name: "n" }, redact);

    expect(await device_retrieve_strict(KEY)).toEqual({ name: "n" });
  });

  it("stores the full value when no redactor is given", async () => {
    await device_store(KEY, { secret: "s", name: "n" });

    expect(await device_retrieve_strict(KEY)).toEqual({
      secret: "s",
      name: "n",
    });
  });
});
