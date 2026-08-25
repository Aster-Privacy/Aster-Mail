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

import { signature_allowed_for_draft_type } from "./signature_scope";

describe("signature_allowed_for_draft_type", () => {
  it("includes a signature when the scope settings are absent", () => {
    expect(signature_allowed_for_draft_type({}, "reply")).toBe(true);
    expect(signature_allowed_for_draft_type({}, "forward")).toBe(true);
    expect(signature_allowed_for_draft_type({}, "new")).toBe(true);
  });

  it("skips replies when the reply scope is turned off", () => {
    const prefs = { signature_in_replies: false };

    expect(signature_allowed_for_draft_type(prefs, "reply")).toBe(false);
    expect(signature_allowed_for_draft_type(prefs, "forward")).toBe(true);
    expect(signature_allowed_for_draft_type(prefs, "new")).toBe(true);
  });

  it("skips forwards when the forward scope is turned off", () => {
    const prefs = { signature_in_forwards: false };

    expect(signature_allowed_for_draft_type(prefs, "forward")).toBe(false);
    expect(signature_allowed_for_draft_type(prefs, "reply")).toBe(true);
  });
});
