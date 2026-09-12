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

import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: (address: string) =>
    address === "me@aster.cx" ? "hash-for-me" : null,
}));

import { build_view_list_params } from "./views";

describe("build_view_list_params alias direction", () => {
  it("asks for both directions on the default alias view", () => {
    const params = build_view_list_params("alias-me@aster.cx");

    expect(params.routing_token).toBe("hash-for-me");
    expect(params.direction).toBe("either");
    expect(params.item_type).toBeUndefined();
  });

  it("asks for sent only", () => {
    expect(build_view_list_params("alias-me@aster.cx|sent").direction).toBe(
      "sent",
    );
  });

  it("asks for received only", () => {
    expect(build_view_list_params("alias-me@aster.cx|received").direction).toBe(
      "received",
    );
  });

  it("omits the direction when the alias hash is unknown", () => {
    const params = build_view_list_params("alias-other@aster.cx|sent");

    expect(params.routing_token).toBeUndefined();
    expect(params.direction).toBeUndefined();
  });
});
