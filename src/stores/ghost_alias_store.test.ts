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

import { looks_like_unregistered_ghost_email } from "./ghost_alias_store";

describe("looks_like_unregistered_ghost_email (reply From-field alias bug)", () => {
  it("matches a real ghost-shaped address on the ghost domain", () => {
    expect(
      looks_like_unregistered_ghost_email("sage.ridge7k2m9adx@astermail.org"),
    ).toBe(true);
  });

  it("matches a ghost-shaped address regardless of case", () => {
    expect(
      looks_like_unregistered_ghost_email("Sage.Ridge7K2M9ADX@AsterMail.org"),
    ).toBe(true);
  });

  it("does not match a regular random-words alias on aster.cx even though the shape is identical", () => {
    expect(looks_like_unregistered_ghost_email("swift.wolf84@aster.cx")).toBe(
      false,
    );
  });

  it("does not match the exact reported alias shape from the bug report", () => {
    expect(
      looks_like_unregistered_ghost_email("myferociousdragon84@aster.cx"),
    ).toBe(false);
    expect(
      looks_like_unregistered_ghost_email("myfe.rociousdragon84@aster.cx"),
    ).toBe(false);
  });

  it("does not match a ghost-domain address that is missing the word.word shape", () => {
    expect(
      looks_like_unregistered_ghost_email("notghostshaped@astermail.org"),
    ).toBe(false);
  });

  it("does not match a primary or custom-domain address", () => {
    expect(
      looks_like_unregistered_ghost_email("jordan.sami@astermail.org"),
    ).toBe(true);
    expect(looks_like_unregistered_ghost_email("jordan@astermail.org")).toBe(
      false,
    );
    expect(
      looks_like_unregistered_ghost_email("jordan.sami@customdomain.com"),
    ).toBe(false);
  });
});
