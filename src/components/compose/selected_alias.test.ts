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
  compose_selected_alias,
  selected_alias_from_location,
} from "./selected_alias";

describe("selected_alias_from_location", () => {
  it("reads the alias from the alias view path", () => {
    expect(
      selected_alias_from_location("/alias/shopping%40astermail.org"),
    ).toBe("shopping@astermail.org");
  });

  it("reads only the first path segment", () => {
    expect(
      selected_alias_from_location("/alias/shopping%40astermail.org/extra"),
    ).toBe("shopping@astermail.org");
  });

  it("returns null for an empty or malformed alias segment", () => {
    expect(selected_alias_from_location("/alias/")).toBeNull();
    expect(selected_alias_from_location("/alias/%20%20")).toBeNull();
    expect(selected_alias_from_location("/alias/%E0%A4%A")).toBeNull();
  });

  it("returns null outside an alias view", () => {
    for (const path of ["/", "/inbox", "/folder/abc", "/tag/x", "/compose"]) {
      expect(selected_alias_from_location(path)).toBeNull();
    }
  });

  it("reads the alias of a message opened from an alias view", () => {
    expect(
      selected_alias_from_location("/email/abc", {
        from_view: "alias-shopping@astermail.org",
      }),
    ).toBe("shopping@astermail.org");
    expect(
      selected_alias_from_location("/email/abc", {
        from_view: "alias-shopping@astermail.org|sent",
      }),
    ).toBe("shopping@astermail.org");
  });

  it("returns null for a message opened from another view", () => {
    expect(
      selected_alias_from_location("/email/abc", { from_view: "inbox" }),
    ).toBeNull();
    expect(selected_alias_from_location("/email/abc")).toBeNull();
    expect(selected_alias_from_location("/email/abc", null)).toBeNull();
    expect(selected_alias_from_location("/email/abc", "alias-x")).toBeNull();
    expect(
      selected_alias_from_location("/email/abc", { from_view: 42 }),
    ).toBeNull();
    expect(
      selected_alias_from_location("/email/abc", { from_view: "alias-" }),
    ).toBeNull();
  });

  it("ignores a from_view state outside a message view", () => {
    expect(
      selected_alias_from_location("/inbox", {
        from_view: "alias-shopping@astermail.org",
      }),
    ).toBeNull();
  });
});

describe("compose_selected_alias", () => {
  const alias = "shopping@astermail.org";

  it("is off unless the setting is exactly true", () => {
    expect(compose_selected_alias(undefined, null, alias)).toBeNull();
    expect(compose_selected_alias(false, null, alias)).toBeNull();
    expect(
      compose_selected_alias("true" as unknown as boolean, null, alias),
    ).toBeNull();
  });

  it("returns the alias for a brand-new message", () => {
    expect(compose_selected_alias(true, null, alias)).toBe(alias);
    expect(compose_selected_alias(true, undefined, alias)).toBe(alias);
    expect(
      compose_selected_alias(true, { id: "", draft_type: "new" }, alias),
    ).toBe(alias);
  });

  it("leaves a reopened draft alone", () => {
    expect(
      compose_selected_alias(true, { id: "draft-1", draft_type: "new" }, alias),
    ).toBeNull();
    expect(
      compose_selected_alias(
        true,
        { id: "draft-2", draft_type: "reply" },
        alias,
      ),
    ).toBeNull();
  });

  it("leaves replies and forwards alone", () => {
    for (const draft_type of ["reply", "reply_all", "forward", undefined]) {
      expect(
        compose_selected_alias(true, { id: "", draft_type }, alias),
      ).toBeNull();
    }
  });

  it("returns null when no alias is selected", () => {
    expect(compose_selected_alias(true, null, null)).toBeNull();
    expect(compose_selected_alias(true, null, undefined)).toBeNull();
    expect(compose_selected_alias(true, null, "   ")).toBeNull();
  });
});
