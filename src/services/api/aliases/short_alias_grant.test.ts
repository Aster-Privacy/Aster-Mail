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
import { afterEach, describe, expect, it } from "vitest";

import {
  get_alias_min_length,
  set_short_aliases_allowed,
} from "./short_alias_grant";
import { validate_local_part } from "./validate";

describe("short alias grant", () => {
  afterEach(() => {
    set_short_aliases_allowed(false);
  });

  it("rejects local parts under three characters by default", () => {
    expect(get_alias_min_length()).toBe(3);
    expect(validate_local_part("jf").valid).toBe(false);
    expect(validate_local_part("jf").error_key).toBe("errors.alias_too_short");
    expect(validate_local_part("jfk").valid).toBe(true);
  });

  it("accepts one and two character local parts once granted", () => {
    set_short_aliases_allowed(true);
    expect(get_alias_min_length()).toBe(1);
    expect(validate_local_part("j").valid).toBe(true);
    expect(validate_local_part("jf").valid).toBe(true);
    expect(validate_local_part("").valid).toBe(false);
  });
});
