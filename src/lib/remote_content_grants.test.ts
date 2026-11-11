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
import { describe, it, expect } from "vitest";

import {
  NO_REMOTE_CONTENT_GRANTS,
  grant_remote_content,
  granted_content_types,
  has_remote_content_grant,
  honored_content_types,
} from "@/lib/remote_content_grants";

describe("remote content grants", () => {
  it("starts with no message allowed to load anything", () => {
    expect(has_remote_content_grant(NO_REMOTE_CONTENT_GRANTS, "m1")).toBe(
      false,
    );
    expect(granted_content_types(undefined, "m1").size).toBe(0);
  });

  it("allows only the message the choice was made on", () => {
    const grants = grant_remote_content(NO_REMOTE_CONTENT_GRANTS, "m1", [
      "image",
    ]);

    expect([...granted_content_types(grants, "m1")]).toEqual(["image"]);
    expect(granted_content_types(grants, "m2").size).toBe(0);
    expect(has_remote_content_grant(grants, "m2")).toBe(false);
  });

  it("adds content types for one message without touching another", () => {
    const first = grant_remote_content(NO_REMOTE_CONTENT_GRANTS, "m1", [
      "image",
    ]);
    const second = grant_remote_content(first, "m2", ["font", "css"]);
    const third = grant_remote_content(second, "m1", ["tracking_pixel"]);

    expect([...granted_content_types(third, "m1")].sort()).toEqual([
      "image",
      "tracking_pixel",
    ]);
    expect([...granted_content_types(third, "m2")].sort()).toEqual([
      "css",
      "font",
    ]);
    expect(granted_content_types(third, "m2")).toBe(
      granted_content_types(second, "m2"),
    );
  });

  it("does not change earlier grant maps", () => {
    const first = grant_remote_content(NO_REMOTE_CONTENT_GRANTS, "m1", [
      "image",
    ]);

    grant_remote_content(first, "m1", ["font"]);

    expect([...granted_content_types(first, "m1")]).toEqual(["image"]);
    expect(NO_REMOTE_CONTENT_GRANTS.size).toBe(0);
  });

  it("honors every allowed type while image loading can be allowed", () => {
    const types = new Set(["image", "tracking_pixel", "font", "css"]);

    expect(honored_content_types(types, true)).toBe(types);
  });

  it("drops image types when image loading cannot be allowed", () => {
    const types = new Set(["image", "tracking_pixel", "font", "css"]);

    expect([...honored_content_types(types, false)].sort()).toEqual([
      "css",
      "font",
    ]);
    expect(
      honored_content_types(new Set(["image", "tracking_pixel"]), false).size,
    ).toBe(0);
    expect(honored_content_types(undefined, false).size).toBe(0);
    expect([...types].sort()).toEqual([
      "css",
      "font",
      "image",
      "tracking_pixel",
    ]);
  });

  it("keeps the same map when nothing new is allowed", () => {
    const first = grant_remote_content(NO_REMOTE_CONTENT_GRANTS, "m1", [
      "image",
    ]);

    expect(grant_remote_content(first, "m1", ["image"])).toBe(first);
    expect(grant_remote_content(first, "m1", [])).toBe(first);
    expect(grant_remote_content(first, "", ["image"])).toBe(first);
  });
});
