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

vi.mock("framer-motion", () => ({ motion: {} }));
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));
vi.mock("@/provider", () => ({ use_should_reduce_motion: () => false }));
vi.mock("@/lib/hard_redirect", () => ({ get_app_query_param: vi.fn() }));

const set_location = (url: string) => {
  window.history.replaceState({}, "", url);
};

const load = async () => {
  vi.resetModules();

  const mod = await import("./sign_in_helpers");

  return mod.get_safe_next_path;
};

describe("get_safe_next_path", () => {
  beforeEach(() => {
    set_location("/sign-in");
  });

  it("returns the requested path", async () => {
    const get_safe_next_path = await load();

    set_location("/sign-in?next=%2Fstarred");

    expect(get_safe_next_path()).toBe("/starred");
  });

  it("keeps returning the path after the url query is consumed", async () => {
    const get_safe_next_path = await load();

    set_location("/u/0/sign-in?next=%2Fstarred");

    expect(get_safe_next_path()).toBe("/starred");

    set_location("/u/0/starred");

    expect(get_safe_next_path()).toBe("/starred");
  });

  it("strips an account prefix from the requested path", async () => {
    const get_safe_next_path = await load();

    set_location("/u/1/sign-in?next=%2Fu%2F1%2Flink-device");

    expect(get_safe_next_path()).toBe("/link-device");
  });

  it("rejects a prefixed sign-in path so login cannot loop", async () => {
    const get_safe_next_path = await load();

    set_location("/u/0/sign-in?next=%2Fu%2F0%2Fsign-in");

    expect(get_safe_next_path()).toBe("/");
  });

  it("rejects protocol-relative and absolute destinations", async () => {
    const get_safe_next_path = await load();

    set_location("/sign-in?next=%2F%2Fevil.example");

    expect(get_safe_next_path()).toBe("/");

    set_location("/sign-in?next=https%3A%2F%2Fevil.example");

    expect(get_safe_next_path()).toBe("/");
  });

  it("returns the root when no next path is requested", async () => {
    const get_safe_next_path = await load();

    set_location("/sign-in");

    expect(get_safe_next_path()).toBe("/");
  });
});
