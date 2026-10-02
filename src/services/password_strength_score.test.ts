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
import { describe, it, expect } from "vitest";

import { is_strong_message_password } from "./password_strength_score";

describe("is_strong_message_password", () => {
  it.each([
    "",
    "a",
    "password",
    "Password1",
    "abcdefghijkl",
    "aaaaaaaaaaaaaaaaaaaa",
  ])("rejects %j", (password) => {
    expect(is_strong_message_password(password)).toBe(false);
  });

  it.each([
    "correct horse battery staple",
    "Tr0ub4dor-and-3",
    "abcdefghijk1",
    "AbcdefghijkL",
  ])("accepts %j", (password) => {
    expect(is_strong_message_password(password)).toBe(true);
  });
});
