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

import { in_app_route_for } from "./in_app_link";

const origins = ["https://app.astermail.org"];
const token = "a".repeat(64);

describe("in_app_route_for", () => {
  it("keeps a family invite link inside the app", () => {
    expect(
      in_app_route_for(
        `https://app.astermail.org/join/family?token=${token}`,
        origins,
      ),
    ).toBe(`/join/family?token=${token}`);
  });

  it("drops an account prefix from the link", () => {
    expect(
      in_app_route_for(
        `https://app.astermail.org/u/2/join/family?token=${token}`,
        origins,
      ),
    ).toBe(`/join/family?token=${token}`);
  });

  it("keeps a reserved address claim link inside the app", () => {
    expect(
      in_app_route_for("https://app.astermail.org/family/claim/abc", origins),
    ).toBe("/family/claim/abc");
  });

  it("ignores other origins", () => {
    expect(
      in_app_route_for(
        `https://app.astermail.org.example.test/join/family?token=${token}`,
        origins,
      ),
    ).toBeNull();
    expect(
      in_app_route_for(`http://app.astermail.org/join/family`, origins),
    ).toBeNull();
  });

  it("ignores other app paths", () => {
    expect(
      in_app_route_for("https://app.astermail.org/settings", origins),
    ).toBeNull();
    expect(
      in_app_route_for("https://app.astermail.org/family/claim/", origins),
    ).toBeNull();
    expect(
      in_app_route_for("https://app.astermail.org/join/familyx", origins),
    ).toBeNull();
  });

  it("ignores values that are not URLs", () => {
    expect(in_app_route_for("not a url", origins)).toBeNull();
  });
});
