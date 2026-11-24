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
import { describe, expect, it } from "vitest";

import { build_restore_sign_in_path } from "./restore_sign_in_path";

const token = "AbCdEf0123456789_-xyz";

describe("build_restore_sign_in_path", () => {
  it("keeps a family invite as the return path", () => {
    expect(
      build_restore_sign_in_path("ken", "/join/family", `?token=${token}`),
    ).toBe(
      `/sign-in?u=ken&next=${encodeURIComponent(`/join/family?token=${token}`)}`,
    );
  });

  it("drops the return path for other pages", () => {
    expect(build_restore_sign_in_path("ken", "/inbox", "")).toBe(
      "/sign-in?u=ken",
    );
  });

  it("drops a malformed invite query", () => {
    expect(
      build_restore_sign_in_path("ken", "/join/family", "?token=x&next=//evil"),
    ).toBe("/sign-in?u=ken");
  });

  it("encodes the username", () => {
    expect(build_restore_sign_in_path("a b", "/", "")).toBe(
      "/sign-in?u=a%20b",
    );
  });
});
