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
  can_show_special_offer,
  close_special_offer,
  get_special_offer_snapshot,
  show_special_offer,
} from "./special_offer_store";

describe("special_offer_store auth route guard", () => {
  beforeEach(() => {
    close_special_offer();
    window.history.pushState({}, "", "/");
  });

  it("opens inside the app and reports it", () => {
    expect(can_show_special_offer()).toBe(true);
    expect(show_special_offer("auto")).toBe(true);
    expect(get_special_offer_snapshot().is_open).toBe(true);
  });

  it("refuses to open on the registration flow and reports it", () => {
    window.history.pushState({}, "", "/register");

    expect(can_show_special_offer()).toBe(false);
    expect(show_special_offer("auto")).toBe(false);
    expect(get_special_offer_snapshot().is_open).toBe(false);
  });
});
