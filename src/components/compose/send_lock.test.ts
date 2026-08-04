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
  can_acquire_send_lock,
  is_repeat_send,
  SEND_LOCK_STALL_MS,
  SEND_REPEAT_GUARD_MS,
} from "@/components/compose/send_lock";

describe("can_acquire_send_lock", () => {
  it("allows sending when no send is in flight", () => {
    expect(can_acquire_send_lock({ held: false, started_at: 0 }, 1000)).toBe(
      true,
    );
  });

  it("blocks a second send while one is genuinely in flight", () => {
    expect(can_acquire_send_lock({ held: true, started_at: 1000 }, 1200)).toBe(
      false,
    );
  });

  it("breaks a lock that was leaked and never released", () => {
    expect(
      can_acquire_send_lock(
        { held: true, started_at: 1000 },
        1000 + SEND_LOCK_STALL_MS,
      ),
    ).toBe(true);
  });

  it("never strands the send button forever", () => {
    expect(
      can_acquire_send_lock({ held: true, started_at: 0 }, 24 * 60 * 60 * 1000),
    ).toBe(true);
  });
});

describe("is_repeat_send", () => {
  it("does not throttle the first send", () => {
    expect(is_repeat_send(0, 5000)).toBe(false);
  });

  it("swallows an accidental double submit", () => {
    expect(is_repeat_send(5000, 5100)).toBe(true);
  });

  it("allows a deliberate resend once the guard elapses", () => {
    expect(is_repeat_send(5000, 5000 + SEND_REPEAT_GUARD_MS)).toBe(false);
  });

  it("allows an immediate retry after a failure clears the marker", () => {
    expect(is_repeat_send(0, 5100)).toBe(false);
  });
});
