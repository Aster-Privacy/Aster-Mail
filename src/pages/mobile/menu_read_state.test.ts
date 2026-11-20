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
import { describe, expect, it } from "vitest";

import { resolve_menu_message } from "./menu_read_state";

describe("resolve_menu_message", () => {
  it("returns null when no menu is open", () => {
    expect(resolve_menu_message(null, [], new Set())).toBeNull();
  });

  it("reads the live thread copy instead of the snapshot taken at tap", () => {
    const snapshot = { id: "a", is_read: false };
    const live = { id: "a", is_read: true };

    expect(resolve_menu_message(snapshot, [live], new Set())).toBe(live);
  });

  it("treats a message marked read on this screen as read", () => {
    const stale = { id: "a", is_read: false };
    const resolved = resolve_menu_message(stale, [stale], new Set(["a"]));

    expect(resolved?.is_read).toBe(true);
  });

  it("keeps an unread message unread", () => {
    const unread = { id: "a", is_read: false };

    expect(resolve_menu_message(unread, [unread], new Set())).toBe(unread);
  });
});
