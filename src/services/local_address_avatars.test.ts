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
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clear_local_address_avatars,
  get_local_address_avatar,
  set_local_address_avatars,
  subscribe_local_address_avatars,
} from "./local_address_avatars";

describe("local_address_avatars", () => {
  beforeEach(() => {
    clear_local_address_avatars();
  });

  it("returns null when nothing is published", () => {
    expect(get_local_address_avatar("me@astermail.org")).toBeNull();
  });

  it("resolves a published alias avatar", () => {
    set_local_address_avatars([
      { email: "alias@astermail.org", profile_picture: "data:image/png;base64,a" },
    ]);

    expect(get_local_address_avatar("alias@astermail.org")?.profile_picture).toBe(
      "data:image/png;base64,a",
    );
  });

  it("matches case and dot variants of the local part", () => {
    set_local_address_avatars([
      { email: "First.Last@astermail.org", profile_picture: "pic" },
    ]);

    expect(get_local_address_avatar("  firstlast@ASTERMAIL.org ")?.profile_picture).toBe(
      "pic",
    );
  });

  it("skips addresses without a picture", () => {
    set_local_address_avatars([{ email: "plain@astermail.org" }]);

    expect(get_local_address_avatar("plain@astermail.org")).toBeNull();
  });

  it("keeps the first entry when two addresses normalize the same", () => {
    set_local_address_avatars([
      { email: "a.b@astermail.org", profile_picture: "first" },
      { email: "ab@astermail.org", profile_picture: "second" },
    ]);

    expect(get_local_address_avatar("ab@astermail.org")?.profile_picture).toBe("first");
  });

  it("notifies subscribers only when the contents change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_local_address_avatars(listener);

    set_local_address_avatars([{ email: "x@astermail.org", profile_picture: "p" }]);
    expect(listener).toHaveBeenCalledTimes(1);

    set_local_address_avatars([{ email: "x@astermail.org", profile_picture: "p" }]);
    expect(listener).toHaveBeenCalledTimes(1);

    set_local_address_avatars([{ email: "x@astermail.org", profile_picture: "q" }]);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    set_local_address_avatars([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps a stable snapshot reference across reads", () => {
    set_local_address_avatars([{ email: "y@astermail.org", profile_picture: "p" }]);

    expect(get_local_address_avatar("y@astermail.org")).toBe(
      get_local_address_avatar("y@astermail.org"),
    );
  });

  it("clears every entry", () => {
    set_local_address_avatars([{ email: "z@astermail.org", profile_picture: "p" }]);
    clear_local_address_avatars();

    expect(get_local_address_avatar("z@astermail.org")).toBeNull();
  });
});
