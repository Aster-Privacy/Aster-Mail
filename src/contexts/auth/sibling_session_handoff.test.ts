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

import { can_attempt_sibling_handoff } from "./sibling_session_handoff";

describe("can_attempt_sibling_handoff", () => {
  it("restores a session on the family invite page", () => {
    expect(can_attempt_sibling_handoff("/join/family")).toBe(true);
  });

  it("skips signed-out flows", () => {
    expect(can_attempt_sibling_handoff("/register")).toBe(false);
    expect(can_attempt_sibling_handoff("/family/claim/abc")).toBe(false);
    expect(can_attempt_sibling_handoff("/reset-password")).toBe(false);
  });

  it("restores a session on mailbox pages", () => {
    expect(can_attempt_sibling_handoff("/inbox")).toBe(true);
  });
});
