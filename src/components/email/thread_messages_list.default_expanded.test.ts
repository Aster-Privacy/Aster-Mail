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

import { resolve_default_expanded_id } from "./thread_messages_list";

describe("resolve_default_expanded_id", () => {
  const messages = [{ id: "received-1" }, { id: "sent-reply-1" }];

  it("expands the clicked sent reply, not the last message in the thread", () => {
    expect(resolve_default_expanded_id(messages, "received-1")).toBe(
      "received-1",
    );
  });

  it("falls back to the last message when no target is given", () => {
    expect(resolve_default_expanded_id(messages, undefined)).toBe(
      "sent-reply-1",
    );
  });

  it("falls back to the last message when the target id is not in the thread", () => {
    expect(resolve_default_expanded_id(messages, "unknown-id")).toBe(
      "sent-reply-1",
    );
  });

  it("returns undefined for an empty thread", () => {
    expect(resolve_default_expanded_id([], "anything")).toBeUndefined();
  });
});
