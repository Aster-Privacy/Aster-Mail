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
import { describe, it, expect, vi } from "vitest";

import {
  forget_totp_required,
  peek_totp_required,
  remember_totp_required,
  subscribe_totp_required,
} from "@/services/api/step_up_cache";

describe("step_up_cache", () => {
  it("remembers, notifies once per change, and forgets", () => {
    forget_totp_required();
    const listener = vi.fn();
    const off = subscribe_totp_required(listener);

    remember_totp_required(true);
    remember_totp_required(true);
    expect(peek_totp_required()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    forget_totp_required();
    expect(peek_totp_required()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    remember_totp_required(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
