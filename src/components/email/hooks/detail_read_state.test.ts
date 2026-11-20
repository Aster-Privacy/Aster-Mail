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

import {
  with_item_read_intent,
  with_message_read,
  with_read_intents,
} from "./detail_read_state";

const opened = { id: "a", is_read: false };
const older = { id: "b", is_read: true };

describe("detail read state", () => {
  it("marks the opened message read without touching the others", () => {
    const next = with_message_read([opened, older], "a", true);

    expect(next[0].is_read).toBe(true);
    expect(next[1]).toBe(older);
  });

  it("keeps the same array when nothing changes", () => {
    const list = [opened, older];

    expect(with_message_read(list, "b", true)).toBe(list);
    expect(with_message_read(list, "missing", true)).toBe(list);
  });

  it("applies a pending read intent over a stale fetched copy", () => {
    const next = with_read_intents([opened, older], (id) =>
      id === "a" ? true : undefined,
    );

    expect(next[0].is_read).toBe(true);
    expect(next[1]).toBe(older);
  });

  it("applies an unread intent over a read copy", () => {
    const next = with_read_intents([older], () => false);

    expect(next[0].is_read).toBe(false);
  });

  it("keeps the same array when no intent differs", () => {
    const list = [opened, older];

    expect(with_read_intents(list, () => undefined)).toBe(list);
  });

  it("resolves the opened email against its read intent", () => {
    expect(with_item_read_intent(opened, () => true)?.is_read).toBe(true);
    expect(with_item_read_intent(opened, () => undefined)).toBe(opened);
    expect(with_item_read_intent(null, () => true)).toBeNull();
  });
});
