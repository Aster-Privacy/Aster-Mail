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
import { beforeEach, describe, expect, it } from "vitest";

import {
  close_upgrade_modal,
  get_upgrade_snapshot,
  show_plan_limit_upgrade,
  show_storage_full_upgrade,
} from "./upgrade_store";

describe("upgrade_store auth route guard", () => {
  beforeEach(() => {
    close_upgrade_modal();
    window.history.pushState({}, "", "/");
  });

  it("opens the plan limit modal inside the app", () => {
    show_plan_limit_upgrade({ resource: "aliases" });
    expect(get_upgrade_snapshot().is_open).toBe(true);
  });

  it("stays closed while the user is registering", () => {
    window.history.pushState({}, "", "/register");
    show_plan_limit_upgrade({ resource: "signed-in accounts" });
    expect(get_upgrade_snapshot().is_open).toBe(false);

    show_storage_full_upgrade({});
    expect(get_upgrade_snapshot().is_open).toBe(false);
  });

  it("stays closed on every other auth route", () => {
    for (const route of [
      "/sign-in",
      "/signup",
      "/invite/abc",
      "/link-device",
    ]) {
      window.history.pushState({}, "", route);
      show_plan_limit_upgrade({ resource: "aliases" });
      expect(get_upgrade_snapshot().is_open).toBe(false);
    }
  });
});
