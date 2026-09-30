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

const BACKEND_ACCEPTED = /^[A-Za-z0-9_-]{16,128}$/;
const KEY = "aster_multi_account_device_id";
const LEGACY_KEY = "aster_device_id";

async function fresh_get_device_id() {
  const module = await import("./device_id");

  return module.get_device_id;
}

describe("get_device_id", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("generates an id the backend accepts", async () => {
    const get_device_id = await fresh_get_device_id();
    const id = get_device_id();

    expect(id).toMatch(BACKEND_ACCEPTED);
    expect(localStorage.getItem(KEY)).toBe(id);
  });

  it("adopts a valid legacy id so existing links survive", async () => {
    const legacy = "a".repeat(64);

    localStorage.setItem(LEGACY_KEY, legacy);

    const get_device_id = await fresh_get_device_id();

    expect(get_device_id()).toBe(legacy);
  });

  it("rejects a base64 legacy id written by secure storage", async () => {
    const base64_id = "kQ+Vz/9m1nJ0aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2u=";

    localStorage.setItem(LEGACY_KEY, base64_id);

    const get_device_id = await fresh_get_device_id();
    const id = get_device_id();

    expect(id).not.toBe(base64_id);
    expect(id).toMatch(BACKEND_ACCEPTED);
  });

  it("does not write to the secure storage key", async () => {
    const get_device_id = await fresh_get_device_id();

    get_device_id();

    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("stays stable once stored", async () => {
    const stored = "b".repeat(32);

    localStorage.setItem(KEY, stored);

    const get_device_id = await fresh_get_device_id();

    expect(get_device_id()).toBe(stored);
  });
});
