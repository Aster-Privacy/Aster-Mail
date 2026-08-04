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

import {
  compose_shell_mode,
  shows_expanded_backdrop,
} from "@/components/compose/compose_shell_mode";

describe("compose_shell_mode", () => {
  it("is docked when neither minimized nor expanded", () => {
    expect(compose_shell_mode(false, false)).toBe("docked");
  });

  it("is expanded when expanded and not minimized", () => {
    expect(compose_shell_mode(false, true)).toBe("expanded");
  });

  it("is minimized when minimized and not expanded", () => {
    expect(compose_shell_mode(true, false)).toBe("minimized");
  });

  it("is minimized when minimized from full window", () => {
    expect(compose_shell_mode(true, true)).toBe("minimized");
  });
});

describe("shows_expanded_backdrop", () => {
  it("covers the app only while genuinely full window", () => {
    expect(shows_expanded_backdrop(false, true)).toBe(true);
  });

  it("is withdrawn once minimized from full window", () => {
    expect(shows_expanded_backdrop(true, true)).toBe(false);
  });

  it("is absent when docked", () => {
    expect(shows_expanded_backdrop(false, false)).toBe(false);
  });
});
