//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import { require_encryption_after_server_load } from "./require_encryption_floor";

describe("require_encryption_after_server_load", () => {
  it("keeps the local choice when the server reports it off", () => {
    expect(require_encryption_after_server_load(true, false)).toBe(true);
    expect(require_encryption_after_server_load(true, undefined)).toBe(true);
  });

  it("lets the server raise the requirement", () => {
    expect(require_encryption_after_server_load(false, true)).toBe(true);
    expect(require_encryption_after_server_load(undefined, true)).toBe(true);
  });

  it("stays off when both sides are off", () => {
    expect(require_encryption_after_server_load(false, false)).toBe(false);
    expect(require_encryption_after_server_load(undefined, undefined)).toBe(false);
  });
});
