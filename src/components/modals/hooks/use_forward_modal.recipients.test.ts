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

import {
  forward_subject_for,
  has_invalid_pending_recipient,
} from "@/components/modals/hooks/use_forward_modal/helpers";

describe("forward_subject_for", () => {
  it("adds the prefix once", () => {
    expect(forward_subject_for("Plans", "Fwd:")).toBe("Fwd: Plans");
  });

  it("keeps a subject that already has the prefix", () => {
    expect(forward_subject_for("Fwd: Plans", "Fwd:")).toBe("Fwd: Plans");
    expect(forward_subject_for("  Fwd: Plans", "Fwd:")).toBe("  Fwd: Plans");
  });
});

describe("has_invalid_pending_recipient", () => {
  it("ignores empty fields", () => {
    expect(has_invalid_pending_recipient({ to: "", cc: " ", bcc: "" })).toBe(
      false,
    );
  });

  it("accepts a complete address", () => {
    expect(
      has_invalid_pending_recipient({ to: "a@example.com", cc: "", bcc: "" }),
    ).toBe(false);
  });

  it("flags unfinished text in any field", () => {
    expect(has_invalid_pending_recipient({ to: "", cc: "bob", bcc: "" })).toBe(
      true,
    );
    expect(
      has_invalid_pending_recipient({ to: "", cc: "", bcc: "bob@exa" }),
    ).toBe(true);
  });
});
