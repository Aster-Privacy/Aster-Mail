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

import { opened_message_is_collapsed } from "./use_opened_message_anchor";

describe("opened_message_is_collapsed", () => {
  it("is false for a short conversation", () => {
    expect(opened_message_is_collapsed(["a", "b", "c", "d"], "b")).toBe(false);
  });

  it("is true for a message in the collapsed middle group", () => {
    expect(opened_message_is_collapsed(["a", "b", "c", "d", "e"], "b")).toBe(
      true,
    );
    expect(opened_message_is_collapsed(["a", "b", "c", "d", "e"], "c")).toBe(
      true,
    );
  });

  it("is false for the first message and the visible tail", () => {
    const ids = ["a", "b", "c", "d", "e"];

    expect(opened_message_is_collapsed(ids, "a")).toBe(false);
    expect(opened_message_is_collapsed(ids, "d")).toBe(false);
    expect(opened_message_is_collapsed(ids, "e")).toBe(false);
    expect(opened_message_is_collapsed(ids, "missing")).toBe(false);
  });
});
