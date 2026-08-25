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

import type { SenderOption } from "@/hooks/use_sender_aliases";

import { resolve_auto_sender } from "./sender_auto_selection";

function option(
  id: string,
  type: SenderOption["type"],
  is_enabled = true,
): SenderOption {
  return {
    id,
    email: `${id}@astermail.org`,
    type,
    is_enabled,
  };
}

describe("resolve_auto_sender", () => {
  it("picks nothing when there are no options yet", () => {
    expect(resolve_auto_sender([], null, null, true)).toBeNull();
  });

  it("falls back to the first option before a preference is known", () => {
    const alias = option("alias_1", "alias");

    expect(resolve_auto_sender([alias], null, null, true)).toEqual({
      option: alias,
      is_auto: true,
    });
  });

  it("upgrades an auto pick once the primary address loads", () => {
    const alias = option("alias_1", "alias");
    const primary = option("primary", "primary");

    expect(resolve_auto_sender([primary, alias], alias, null, true)).toEqual({
      option: primary,
      is_auto: true,
    });
  });

  it("upgrades an auto pick to the preferred sender when it loads", () => {
    const alias = option("alias_1", "alias");
    const primary = option("primary", "primary");
    const domain = option("domain_1", "domain");

    expect(
      resolve_auto_sender([primary, alias, domain], alias, "domain_1", true),
    ).toEqual({ option: domain, is_auto: true });
  });

  it("never overrides a sender the user picked", () => {
    const alias = option("alias_1", "alias");
    const primary = option("primary", "primary");

    expect(resolve_auto_sender([primary, alias], alias, null, false)).toBeNull();
  });

  it("leaves an auto pick alone when it is already the best option", () => {
    const primary = option("primary", "primary");
    const alias = option("alias_1", "alias");

    expect(
      resolve_auto_sender([primary, alias], primary, null, true),
    ).toBeNull();
  });

  it("ignores a disabled primary option", () => {
    const alias = option("alias_1", "alias");
    const primary = option("primary", "primary", false);

    expect(resolve_auto_sender([primary, alias], alias, null, true)).toBeNull();
  });
});
