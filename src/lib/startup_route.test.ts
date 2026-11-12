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

import { predict_startup_route } from "./startup_route";

describe("predict_startup_route", () => {
  it.each(["/sign-in", "/sign-in/"])(
    "expects the sign-in page at %s",
    (path) => {
      expect(predict_startup_route(path, false)).toBe("sign_in");
      expect(predict_startup_route(path, true)).toBe("sign_in");
    },
  );

  it.each(["/register", "/register/plan", "/signup"])(
    "expects the registration page at %s",
    (path) => {
      expect(predict_startup_route(path, false)).toBe("register");
      expect(predict_startup_route(path, true)).toBe("register");
    },
  );

  it("expects the sign-in page at the root for a visitor with no stored preferences", () => {
    expect(predict_startup_route("/", false)).toBe("sign_in");
  });

  it("expects no extra page at the root once preferences are stored", () => {
    expect(predict_startup_route("/", true)).toBeNull();
  });

  it.each(["/settings", "/secure/abc", "/sign-in-help", "/registered", ""])(
    "predicts nothing at %s",
    (path) => {
      expect(predict_startup_route(path, false)).toBeNull();
      expect(predict_startup_route(path, true)).toBeNull();
    },
  );
});
