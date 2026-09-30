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

import { is_sendable_address, sanitize_sender_address } from "./sender_address";

describe("sender address guard", () => {
  it("rejects an alias whose local part could not be decrypted", () => {
    expect(is_sendable_address("@astermail.org")).toBe(false);
  });

  it("rejects an address with no domain", () => {
    expect(is_sendable_address("someone@")).toBe(false);
  });

  it("rejects a value that is not an address", () => {
    expect(is_sendable_address("someone")).toBe(false);
    expect(is_sendable_address("")).toBe(false);
    expect(is_sendable_address(null)).toBe(false);
  });

  it("accepts a normal address and strips stray whitespace", () => {
    expect(sanitize_sender_address("  you@astermail.org \n")).toBe(
      "you@astermail.org",
    );
    expect(is_sendable_address("you@astermail.org")).toBe(true);
  });
});
